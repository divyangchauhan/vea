import { getVeaOutboxArbToEthProvider, getVeaInboxArbToEthProvider } from "../utils/ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getL2Network } from "@arbitrum/sdk";
import { NODE_INTERFACE_ADDRESS } from "@arbitrum/sdk/dist/lib/dataEntities/constants";
import { NodeInterface__factory } from "@arbitrum/sdk/dist/lib/abi/factories/NodeInterface__factory";
import { SequencerInbox__factory } from "@arbitrum/sdk/dist/lib/abi/factories/SequencerInbox__factory";
import { BigNumber, ContractTransaction } from "ethers";
import { Block, Log, TransactionReceipt } from "@ethersproject/abstract-provider";
import { SequencerInbox } from "@arbitrum/sdk/dist/lib/abi/SequencerInbox";

require("dotenv").config();

// https://github.com/prysmaticlabs/prysm/blob/493905ee9e33a64293b66823e69704f012b39627/config/params/mainnet_config.go#L103
const slotsPerEpochEth = 32;
const secondsPerSlotEth = 12;

const watch = async () => {
  // connect to RPCs
  const providerEth = new JsonRpcProvider(process.env.RPC_ETH);
  const providerArb = new JsonRpcProvider(process.env.RPC_ARB);

  // use typechain generated contract factories for vea outbox and inbox
  const veaOutbox = getVeaOutboxArbToEthProvider(
    process.env.VEAOUTBOX_ARB_TO_ETH_ADDRESS,
    process.env.PRIVATE_KEY,
    providerEth
  );
  const veaInbox = getVeaInboxArbToEthProvider(
    process.env.VEAINBOX_ARB_TO_ETH_ADDRESS,
    process.env.PRIVATE_KEY,
    providerEth
  );

  // get Arb sequencer params
  const l2Network = await getL2Network(providerArb);
  const sequencer = SequencerInbox__factory.connect(l2Network.ethBridge.sequencerInbox, providerEth);
  const maxDelaySeconds = (
    (await retryOperation(() => sequencer.maxTimeVariation(), 1000, 10))[1] as BigNumber
  ).toNumber();

  // get vea outbox params
  const deposit = (await retryOperation(() => veaOutbox.deposit(), 1000, 10)) as BigNumber;
  const epochPeriod = ((await retryOperation(() => veaOutbox.epochPeriod(), 1000, 10)) as BigNumber).toNumber();
  const sequencerDelayLimit = (
    (await retryOperation(() => veaOutbox.sequencerDelayLimit(), 1000, 10)) as BigNumber
  ).toNumber();

  // *
  // calculate epoch range to check claims on Eth
  // *

  // Finalized Eth block provides an 'anchor point' for the vea epochs in the outbox that are claimable
  const blockFinalizedEth: Block = (await retryOperation(() => providerEth.getBlock("finalized"), 1000, 10)) as Block;

  const coldStartBacklog = 7 * 24 * 60 * 60; // when starting the watcher, specify an extra backlog to check

  // When Sequencer is malicious, even when L1 is finalized, L2 state might be unknown for up to  sequencerDelayLimit + epochPeriod.
  const L2SyncPeriod = sequencerDelayLimit + epochPeriod;
  // When we start the watcher, we need to go back far enough to check for claims which may have been pending L2 state finalization.
  const veaEpochOutboxWatchLowerBound =
    Math.floor((blockFinalizedEth.timestamp - L2SyncPeriod - coldStartBacklog) / epochPeriod) - 2;

  // ETH / Gnosis POS assumes synchronized clocks
  // using local time as a proxy for true "latest" L1 time
  const timeLocal = Math.floor(Date.now() / 1000);

  let veaEpochOutboxClaimableNow = Math.floor(timeLocal / epochPeriod) - 1;

  // only past epochs are claimable, hence shift by one here
  const veaEpochOutboxRange = veaEpochOutboxClaimableNow - veaEpochOutboxWatchLowerBound + 1;
  const veaEpochOutboxCheckClaimsRangeArray: number[] = new Array(veaEpochOutboxRange)
    .fill(veaEpochOutboxWatchLowerBound)
    .map((el, i) => el + i);
  const challengeTxnHashes = new Map<number, string>();

  console.log(
    "cold start: checking past claim history from epoch " +
      veaEpochOutboxCheckClaimsRangeArray[0] +
      " to the current claimable epoch " +
      veaEpochOutboxCheckClaimsRangeArray[veaEpochOutboxCheckClaimsRangeArray.length - 1]
  );

  while (true) {
    // returns the most recent finalized arbBlock found on Ethereum and info about finality issues on Eth.
    // if L1 is experiencing finalization problems, returns the latest arbBlock found in the latest L1 block
    const [blockArbFoundOnL1, blockFinalizedEth, finalityIssueFlagEth] = await getBlocksAndCheckFinality(
      providerEth,
      providerArb,
      sequencer,
      maxDelaySeconds
    );

    if (!blockArbFoundOnL1) {
      console.error("Critical Error: Arbitrum block is not found on L1.");
      return;
    }

    // claims can be made for the previous epoch, hence
    // if an epoch is 2 or more epochs behind the L1 finalized epoch, no further claims can be made, we call this 'veaEpochOutboxFinalized'
    const veaEpochOutboxClaimableFinalized = Math.floor(blockFinalizedEth.timestamp / epochPeriod) - 2;

    const timeLocal = Math.floor(Date.now() / 1000);
    const timeEth = finalityIssueFlagEth ? timeLocal : blockFinalizedEth.timestamp;

    // if the sequencer is offline for maxDelaySeconds, the l2 timestamp in the next block is clamp to the current L1 timestamp - maxDelaySeconds
    const l2Time = Math.max(blockArbFoundOnL1.timestamp, blockFinalizedEth.timestamp - maxDelaySeconds);

    // the latest epoch that is finalized from the L2 POV
    // this depends on the L2 clock
    const veaEpochInboxFinalized = Math.floor(l2Time / epochPeriod) - 1;

    const veaEpochOutboxClaimableNowOld = veaEpochOutboxClaimableNow;
    veaEpochOutboxClaimableNow = Math.floor(timeEth / epochPeriod) - 1;
    const veaEpochsOutboxClaimableNew: number[] = new Array(veaEpochOutboxClaimableNow - veaEpochOutboxClaimableNowOld)
      .fill(veaEpochOutboxClaimableNowOld + 1)
      .map((el, i) => el + i);

    veaEpochOutboxCheckClaimsRangeArray.concat(veaEpochsOutboxClaimableNew);

    if (veaEpochOutboxCheckClaimsRangeArray.length == 0) {
      console.log("no claims to check");
      const timeToNextEpoch = epochPeriod - (Math.floor(Date.now() / 1000) % epochPeriod);
      console.log("waiting till next epoch in " + timeToNextEpoch + " seconds. . .");
      continue;
    }

    for (let index = 0; index < veaEpochOutboxCheckClaimsRangeArray.length; index++) {
      const veaEpochOutboxCheck = veaEpochOutboxCheckClaimsRangeArray[index];
      console.log("checking claim for epoch " + veaEpochOutboxCheck);
      // if L1 experiences finality failure, we use the latest block
      const blockTagEth = finalityIssueFlagEth ? "latest" : "finalized";
      const claimHash = (await retryOperation(
        () => veaOutbox.claimHashes(veaEpochOutboxCheck, { blockTag: blockTagEth }),
        1000,
        10
      )) as string;

      // no claim
      if (claimHash == "0x0000000000000000000000000000000000000000000000000000000000000000") {
        // if epoch is not claimable anymore, remove from array
        if (veaEpochOutboxCheck <= veaEpochOutboxClaimableFinalized) {
          console.log(
            "no claim for epoch " +
              veaEpochOutboxCheck +
              " and the vea epoch in the outbox is finalized (can no longer be claimed)."
          );
          veaEpochOutboxCheckClaimsRangeArray.splice(index, 1);
          index--;
          continue;
        } else {
          console.log(
            "no claim for epoch " +
              veaEpochOutboxCheck +
              " and the vea epoch in the outbox is not finalized (can still be claimed)."
          );
        }
      } else {
        // claim exists

        console.log("claim exists for epoch " + veaEpochOutboxCheck);

        let blockNumberOutboxLowerBound: number;

        // to query event performantly, we limit the block range with the heuristic that. delta blocknumber <= delta timestamp / secondsPerSlot
        if (veaEpochOutboxCheck <= veaEpochOutboxClaimableFinalized) {
          blockNumberOutboxLowerBound =
            blockFinalizedEth.number -
            Math.ceil(((veaEpochOutboxClaimableFinalized - veaEpochOutboxCheck + 2) * epochPeriod) / secondsPerSlotEth);
        } else {
          blockNumberOutboxLowerBound = blockFinalizedEth.number - Math.ceil(epochPeriod / secondsPerSlotEth);
        }

        // get claim data
        const logClaimed: Log = (
          await retryOperation(
            () =>
              providerEth.getLogs({
                address: process.env.VEAOUTBOX_ARB_TO_ETH_ADDRESS,
                topics: veaOutbox.filters.Claimed(null, [veaEpochOutboxCheck], null).topics,
                fromBlock: blockNumberOutboxLowerBound,
                toBlock: blockTagEth,
              }),
            1000,
            10
          )
        )[0] as Log;

        // check the snapshot on the inbox on Arbitrum
        // only check the state from L1 POV, don't trust the sequencer feed.
        // arbBlock is a recent (finalized or latest if there are finality problems) block found posted on L1
        const claimSnapshot = (await retryOperation(
          () => veaInbox.snapshots(veaEpochOutboxCheck, { blockTag: blockArbFoundOnL1.number }),
          1000,
          10
        )) as string;

        // claim differs from snapshot
        if (logClaimed.data != claimSnapshot) {
          console.log("claimed merkle root mismatch for epoch " + veaEpochOutboxCheck);

          // if Eth is finalizing but sequencer is malfunctioning, we can wait until the snapshot is considered finalized (L2 time is in the next epoch)
          if (!finalityIssueFlagEth && veaEpochInboxFinalized < veaEpochOutboxCheck) {
            // note as long as L1 does not have finalization probelms, sequencer could still be malfunctioning
            console.log("L2 snapshot is not yet finalized, waiting for finalization to determine challengable status");
          } else {
            console.log("claim " + veaEpochOutboxCheck + " is challengable");

            const timestampClaimed = (
              (await retryOperation(() => providerEth.getBlock(logClaimed.blockNumber), 1000, 10)) as Block
            ).timestamp;

            var claim = {
              stateRoot: logClaimed.data,
              claimer: "0x" + logClaimed.topics[1].substring(26),
              timestampClaimed: timestampClaimed,
              timestampVerification: 0,
              blocknumberVerification: 0,
              honest: 0,
              challenger: "0x0000000000000000000000000000000000000000",
            };

            const claimHashCalculated = (await retryOperation(
              () => veaOutbox.hashClaim(claim, { blockTag: blockTagEth }),
              1000,
              10
            )) as string;
            if (claimHashCalculated != claimHash) {
              // either claim is already challenged
              // or claim is in verification or verified

              /*

              we want to reconstruct the struct below from events, since only the hash is stored onchain

              struct Claim {
                bytes32 stateRoot;
                address claimer;
                uint32 timestampClaimed;
                uint32 timestampVerification;
                uint32 blocknumberVerification;
                Party honest;
                address challenger;
              }
              
              */
              const logChallenges = (await retryOperation(
                () =>
                  providerEth.getLogs({
                    address: process.env.VEAOUTBOX_ARB_TO_ETH_ADDRESS,
                    topics: veaOutbox.filters.Challenged(veaEpochOutboxCheck, null).topics,
                    fromBlock: blockNumberOutboxLowerBound,
                    toBlock: blockTagEth,
                  }),
                1000,
                10
              )) as Log[];

              // if already challenged, no action needed

              // if not challenged, keep checking all claim struct variables
              if (logChallenges.length == 0) {
                const logVerficiationStarted = (await retryOperation(
                  () =>
                    providerEth.getLogs({
                      address: process.env.VEAOUTBOX_ARB_TO_ETH_ADDRESS,
                      topics: veaOutbox.filters.VerificationStarted(veaEpochOutboxCheck).topics,
                      fromBlock: blockNumberOutboxLowerBound,
                      toBlock: blockTagEth,
                    }),
                  1000,
                  10
                )) as Log[];

                if (logVerficiationStarted.length > 1) {
                  const timestampVerification = (
                    (await retryOperation(
                      () => providerEth.getBlock(logVerficiationStarted[logVerficiationStarted.length - 1].blockNumber),
                      1000,
                      10
                    )) as Block
                  ).timestamp;

                  claim.timestampVerification = timestampVerification;
                  claim.blocknumberVerification = logVerficiationStarted[logVerficiationStarted.length - 1].blockNumber;

                  const claimHashCalculated = (await retryOperation(
                    () => veaOutbox.hashClaim(claim),
                    1000,
                    10
                  )) as string;
                  if (claimHashCalculated != claimHash) {
                    claim.honest = 1;
                    const claimHashCalculated = (await retryOperation(
                      () => veaOutbox.hashClaim(claim),
                      1000,
                      10
                    )) as string;
                    if (claimHashCalculated != claimHash) {
                      console.error(
                        "Invalid claim hash calculated for epoch " +
                          veaEpochOutboxCheck +
                          " claim " +
                          claimHashCalculated +
                          " expected " +
                          claimHash
                      );
                      continue;
                    }
                  }
                }
              } else {
                console.log("claim " + veaEpochOutboxCheck + " is already challenged");
                if (logChallenges[0].blockNumber < blockFinalizedEth.number) {
                  veaEpochOutboxCheckClaimsRangeArray.splice(index, 1);
                  index--;
                  // the challenge is finalized, no further action needed
                  console.log("challenge is finalized");
                  continue;
                }
                continue;
              }
            }

            if (challengeTxnHashes[index] != "") {
              const txnReceipt = (await retryOperation(
                () => providerEth.getTransactionReceipt(challengeTxnHashes[index]),
                10,
                1000
              )) as TransactionReceipt;
              if (!txnReceipt) {
                console.log("challenge txn " + challengeTxnHashes[index] + " not mined yet");
                continue;
              }
              const blockNumber = txnReceipt.blockNumber;
              const challengeBlock = (await retryOperation(() => providerEth.getBlock(blockNumber), 1000, 10)) as Block;
              if (challengeBlock.number < blockFinalizedEth.number) {
                veaEpochOutboxCheckClaimsRangeArray.splice(index, 1);
                index--;
                // the challenge is finalized, no further action needed
                console.log("challenge is finalized");
                continue;
              }
            }

            const gasEstimate = (await retryOperation(
              () =>
                veaOutbox.estimateGas["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
                  veaEpochOutboxCheck,
                  claim,
                  { value: deposit }
                ),
              1000,
              10
            )) as BigNumber;

            // deposit / 2 is the profit for challengers
            // the initial challenge txn is roughly 1/3 of the cost of completing the challenge process.
            const maxFeePerGasProfitable = deposit.div(gasEstimate.mul(3 * 2));

            // priority fee must be higher than MEV to be competitive
            // https://boost-relay.flashbots.net/?order_by=-value
            // eg there's never been > 100 eth in MEV in a block
            // so 100 eth / 15000000 gas per block = 6667 gwei per gas is competitive
            // Set this more modestly if you want to be more conservative
            const maxPriorityFeePerGasMEV = BigNumber.from("6667000000000"); // 6667 gwei

            const txnChallenge = (await retryOperation(
              () =>
                veaOutbox["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
                  veaEpochOutboxCheck,
                  claim,
                  {
                    maxFeePerGas: maxFeePerGasProfitable,
                    maxPriorityFeePerGas: maxPriorityFeePerGasMEV,
                    value: deposit,
                  }
                ),
              1000,
              10
            )) as ContractTransaction;

            txnChallenge.nonce;
            console.log("challenging claim for epoch " + veaEpochOutboxCheck + " with txn hash " + txnChallenge.hash);
          }
        } else {
          console.log("claim hash matches snapshot for epoch " + veaEpochOutboxCheck);
          if (
            veaEpochOutboxCheck <= veaEpochOutboxClaimableFinalized &&
            veaEpochOutboxCheck >= veaEpochInboxFinalized
          ) {
            veaEpochOutboxCheckClaimsRangeArray.splice(index, 1);
            index--;
            continue;
          }
        }
      }
    }

    // 3 second delay for potential block and attestation propogation
    console.log("waiting 3 seconds for potential block and attestation propogation. . .");
    await wait(1000 * 3);
  }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const retryOperation = (operation, delay, retries) =>
  new Promise((resolve, reject) => {
    return operation()
      .then(resolve)
      .catch((reason) => {
        if (retries > 0) {
          // log retry
          console.log("retrying", retries);
          return wait(delay)
            .then(retryOperation.bind(null, operation, delay, retries - 1))
            .then(resolve)
            .catch(reject);
        }
        return reject(reason);
      });
  });

const getBlocksAndCheckFinality = async (
  EthProvider: JsonRpcProvider,
  ArbProvider: JsonRpcProvider,
  sequencer: SequencerInbox,
  maxDelaySeconds: number
): Promise<[Block, Block, Boolean] | undefined> => {
  const blockFinalizedArb = (await retryOperation(() => ArbProvider.getBlock("finalized"), 1000, 10)) as Block;
  const blockFinalizedEth = (await retryOperation(() => EthProvider.getBlock("finalized"), 1000, 10)) as Block;

  const finalityBuffer = 300; // 5 minutes, allows for network delays
  const maxFinalityTimeSecondsEth = (slotsPerEpochEth * 3 - 1) * secondsPerSlotEth; // finalization after 2 justified epochs

  let finalityIssueFlagArb = false;
  let finalityIssueFlagEth = false;

  // check latest arb block to see if there are any sequencer issues
  let blockLatestArb = (await retryOperation(() => ArbProvider.getBlock("latest"), 1000, 10)) as Block;

  // to performantly query the sequencerInbox's SequencerBatchDelivered event on Eth, we limit the block range
  // we use the heuristic that. delta blocknumber <= delta timestamp / secondsPerSlot
  // Arb: -----------x                   <-- Finalized
  //                 ||
  //                 \/
  // Eth: -------------------------x     <-- Finalized
  //            /\
  //            ||<---------------->     <-- Math.floor((timeDiffBlockFinalizedArbL1 + maxDelaySeconds) / secondsPerSlotEth)
  //         fromBlockEth

  const timeDiffBlockFinalizedArbL1 = blockFinalizedEth.timestamp - blockFinalizedArb.timestamp;
  const fromBlockEthFinalized =
    blockFinalizedEth.number - Math.floor((timeDiffBlockFinalizedArbL1 + maxDelaySeconds) / secondsPerSlotEth);

  let blockFinalizedArbToL1Block = await ArbBlockToL1Block(
    ArbProvider,
    sequencer,
    blockFinalizedArb,
    fromBlockEthFinalized,
    false
  );

  if (!blockFinalizedArbToL1Block) {
    console.error("Arbitrum finalized block is not found on L1.");
    finalityIssueFlagArb = true;
  } else if (Math.abs(blockFinalizedArbToL1Block[0].timestamp - blockFinalizedArb.timestamp) > 1800) {
    // The L2 timestamp is drifted from the L1 timestamp in which the L2 block is posted.
    console.error("Finalized L2 block time is more than 30 min drifted from L1 clock.");
  }

  // blockLatestArbToL1Block[0] is the L1 block, blockLatestArbToL1Block[1] is the L2 block (fallsback on latest L2 block if L2 block is not found on L1)
  let blockLatestArbToL1Block = await ArbBlockToL1Block(
    ArbProvider,
    sequencer,
    blockLatestArb,
    fromBlockEthFinalized,
    true
  );

  if (finalityIssueFlagArb && !blockLatestArbToL1Block) {
    console.error("Arbitrum latest block is not found on L1.");
    // this means some issue in the arbitrum node implementation (very bad)
    return undefined;
  }

  // is blockLatestArb is not found on L1, ArbBlockToL1Block fallsback on the latest L2 block found on L1
  if (blockLatestArbToL1Block[1] != blockLatestArb.number) {
    blockLatestArb = (await retryOperation(() => ArbProvider.getBlock(blockLatestArbToL1Block[1]), 1000, 10)) as Block;
  }

  // ETH POS assumes synchronized clocks
  // using local time as a proxy for true "latest" L1 time
  const localTimeSeconds = Math.floor(Date.now() / 1000);

  // The sequencer is completely offline
  // Not necessarily a problem, but we should know about it
  if (localTimeSeconds - blockLatestArbToL1Block[0].timestamp > 1800) {
    console.error("Arbitrum sequencer is offline (from L1 'latest' POV) for atleast 30 minutes.");
  }

  // The L2 timestamp is drifted from the L1 timestamp in which the L2 block is posted.
  // Not necessarily a problem, but we should know about it
  if (Math.abs(blockLatestArbToL1Block[0].timestamp - blockLatestArb.timestamp) > 1800) {
    console.error("Latest L2 block time is more than 30 min drifted from L1 clock.");
    console.error("L2 block time: " + blockLatestArb.timestamp);
    console.error("L1 block time: " + blockLatestArbToL1Block[0].timestamp);
    console.error("L2 block number: " + blockLatestArb.number);
  }

  // Note: Using last finalized block as a proxy for the latest finalized epoch
  // Using a BeaconChain RPC would be more accurate
  if (localTimeSeconds - blockFinalizedEth.timestamp > maxFinalityTimeSecondsEth + finalityBuffer) {
    console.error("Ethereum mainnet is not finalizing");
    finalityIssueFlagEth = true;
  }

  if (blockFinalizedEth.number < blockFinalizedArbToL1Block[0].number) {
    console.error(
      "Arbitrum 'finalized' block is posted in an L1 block which is not finalized. Arbitrum node is out of sync with L1 node. It's recommended to use the same L1 RPC as the L1 node used by the Arbitrum node."
    );
    finalityIssueFlagArb = true;
  }

  // if L1 is experiencing finalization problems, we use the latest L2 block
  // we could
  const blockArbitrum = finalityIssueFlagArb || finalityIssueFlagEth ? blockLatestArb : blockFinalizedArb;

  return [blockArbitrum, blockFinalizedEth, finalityIssueFlagEth];
};

const ArbBlockToL1Block = async (
  L2Provider: JsonRpcProvider,
  sequencer: SequencerInbox,
  L2Block: Block,
  fromBlockEth: number,
  fallbackLatest: boolean
): Promise<[Block, number] | undefined> => {
  const nodeInterface = NodeInterface__factory.connect(NODE_INTERFACE_ADDRESS, L2Provider);

  let latestL2batchOnEth: number;
  let latestL2BlockNumberOnEth: number;
  let result = (await nodeInterface.functions
    .findBatchContainingBlock(L2Block.number, { blockTag: "latest" })
    .catch((e) => {
      // if L2 block is ahead of latest L2 batch on L1, we get an error
      // catch the error and parse it to get the latest L2 batch on L1

      // https://github.com/OffchainLabs/nitro/blob/af87ba29bc34c27bd4d85b3066a1cc3a759bab66/nodeInterface/NodeInterface.go#L544
      const errMsg = JSON.parse(JSON.parse(JSON.stringify(e)).error.body).error.message;
      console.error(errMsg);
      if (fallbackLatest) {
        latestL2batchOnEth = parseInt(errMsg.split(" published in batch ")[1]);
        latestL2BlockNumberOnEth = parseInt(errMsg.split(" is after latest on-chain block ")[1]);
      }
    })) as [BigNumber] & { batch: BigNumber };

  if (!result && !fallbackLatest) return undefined;

  const batch = result?.batch?.toNumber() ?? latestL2batchOnEth;
  const L2BlockNumberFallback = latestL2BlockNumberOnEth ?? L2Block.number;
  /**
   * We use the batch number to query the L1 sequencerInbox's SequencerBatchDelivered event
   * then, we get its emitted transaction hash.
   */
  const queryBatch = sequencer.filters.SequencerBatchDelivered(batch);

  const emittedEvent = (await retryOperation(
    () => sequencer.queryFilter(queryBatch, fromBlockEth, "latest"),
    1000,
    10
  )) as any;
  if (emittedEvent.length == 0) {
    return undefined;
  }

  const L1Block = (await retryOperation(() => emittedEvent[0].getBlock(), 1000, 10)) as Block;
  return [L1Block, L2BlockNumberFallback];
};

(async () => {
  await watch();
})();
export default watch;