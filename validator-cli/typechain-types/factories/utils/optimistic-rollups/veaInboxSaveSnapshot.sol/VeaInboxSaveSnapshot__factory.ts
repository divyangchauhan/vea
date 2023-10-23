/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import { Signer, utils, Contract, ContractFactory, Overrides } from "ethers";
import type { Provider, TransactionRequest } from "@ethersproject/providers";
import type { PromiseOrValue } from "../../../../common";
import type {
  VeaInboxSaveSnapshot,
  VeaInboxSaveSnapshotInterface,
} from "../../../../utils/optimistic-rollups/veaInboxSaveSnapshot.sol/VeaInboxSaveSnapshot";

const _abi = [
  {
    inputs: [
      {
        internalType: "contract IVeaInbox",
        name: "_veaInbox",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    stateMutability: "nonpayable",
    type: "fallback",
  },
  {
    inputs: [],
    name: "veaInbox",
    outputs: [
      {
        internalType: "contract IVeaInbox",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const _bytecode =
  "0x60a060405234801561001057600080fd5b5060405161019f38038061019f83398101604081905261002f91610040565b6001600160a01b0316608052610070565b60006020828403121561005257600080fd5b81516001600160a01b038116811461006957600080fd5b9392505050565b60805161010f61009060003960008181602a0152609b015261010f6000f3fe6080604052348015600f57600080fd5b506004361060285760003560e01c806302d3e236146097575b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b031663519205356040518163ffffffff1660e01b8152600401600060405180830381600087803b158015608257600080fd5b505af11580156095573d6000803e3d6000fd5b005b60bd7f000000000000000000000000000000000000000000000000000000000000000081565b6040516001600160a01b03909116815260200160405180910390f3fea264697066735822122051402368fe33cd3141a97686eaab7ecde02ecfdab3df7055040e6298d108942e64736f6c63430008120033";

type VeaInboxSaveSnapshotConstructorParams = [signer?: Signer] | ConstructorParameters<typeof ContractFactory>;

const isSuperArgs = (xs: VeaInboxSaveSnapshotConstructorParams): xs is ConstructorParameters<typeof ContractFactory> =>
  xs.length > 1;

export class VeaInboxSaveSnapshot__factory extends ContractFactory {
  constructor(...args: VeaInboxSaveSnapshotConstructorParams) {
    if (isSuperArgs(args)) {
      super(...args);
    } else {
      super(_abi, _bytecode, args[0]);
    }
  }

  override deploy(
    _veaInbox: PromiseOrValue<string>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<VeaInboxSaveSnapshot> {
    return super.deploy(_veaInbox, overrides || {}) as Promise<VeaInboxSaveSnapshot>;
  }
  override getDeployTransaction(
    _veaInbox: PromiseOrValue<string>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): TransactionRequest {
    return super.getDeployTransaction(_veaInbox, overrides || {});
  }
  override attach(address: string): VeaInboxSaveSnapshot {
    return super.attach(address) as VeaInboxSaveSnapshot;
  }
  override connect(signer: Signer): VeaInboxSaveSnapshot__factory {
    return super.connect(signer) as VeaInboxSaveSnapshot__factory;
  }

  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): VeaInboxSaveSnapshotInterface {
    return new utils.Interface(_abi) as VeaInboxSaveSnapshotInterface;
  }
  static connect(address: string, signerOrProvider: Signer | Provider): VeaInboxSaveSnapshot {
    return new Contract(address, _abi, signerOrProvider) as VeaInboxSaveSnapshot;
  }
}
