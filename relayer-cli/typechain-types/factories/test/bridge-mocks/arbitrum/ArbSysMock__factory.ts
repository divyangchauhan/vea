/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import { Signer, utils, Contract, ContractFactory, Overrides } from "ethers";
import type { Provider, TransactionRequest } from "@ethersproject/providers";
import type { PromiseOrValue } from "../../../../common";
import type { ArbSysMock, ArbSysMockInterface } from "../../../../test/bridge-mocks/arbitrum/ArbSysMock";

const _abi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "destination",
        type: "address",
      },
      {
        internalType: "bytes",
        name: "calldataForL1",
        type: "bytes",
      },
    ],
    name: "sendTxToL1",
    outputs: [
      {
        internalType: "uint256",
        name: "_withdrawal_ID",
        type: "uint256",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
] as const;

const _bytecode =
  "0x608060405234801561001057600080fd5b506101cb806100206000396000f3fe60806040526004361061001e5760003560e01c8063928c169a14610023575b600080fd5b6100366100313660046100f4565b610048565b60405190815260200160405180910390f35b600080846001600160a01b03168484604051610065929190610185565b6000604051808303816000865af19150503d80600081146100a2576040519150601f19603f3d011682016040523d82523d6000602084013e6100a7565b606091505b50509050806100ec5760405162461bcd60e51b815260206004820152600d60248201526c4661696c6564205478546f4c3160981b604482015260640160405180910390fd5b509392505050565b60008060006040848603121561010957600080fd5b83356001600160a01b038116811461012057600080fd5b9250602084013567ffffffffffffffff8082111561013d57600080fd5b818601915086601f83011261015157600080fd5b81358181111561016057600080fd5b87602082850101111561017257600080fd5b6020830194508093505050509250925092565b818382376000910190815291905056fea26469706673582212201ddf978e6073ee8a5c8d80a8f9a0defb00ba17d05772a49424a6c92cbb25362564736f6c63430008120033";

type ArbSysMockConstructorParams = [signer?: Signer] | ConstructorParameters<typeof ContractFactory>;

const isSuperArgs = (xs: ArbSysMockConstructorParams): xs is ConstructorParameters<typeof ContractFactory> =>
  xs.length > 1;

export class ArbSysMock__factory extends ContractFactory {
  constructor(...args: ArbSysMockConstructorParams) {
    if (isSuperArgs(args)) {
      super(...args);
    } else {
      super(_abi, _bytecode, args[0]);
    }
  }

  override deploy(overrides?: Overrides & { from?: PromiseOrValue<string> }): Promise<ArbSysMock> {
    return super.deploy(overrides || {}) as Promise<ArbSysMock>;
  }
  override getDeployTransaction(overrides?: Overrides & { from?: PromiseOrValue<string> }): TransactionRequest {
    return super.getDeployTransaction(overrides || {});
  }
  override attach(address: string): ArbSysMock {
    return super.attach(address) as ArbSysMock;
  }
  override connect(signer: Signer): ArbSysMock__factory {
    return super.connect(signer) as ArbSysMock__factory;
  }

  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): ArbSysMockInterface {
    return new utils.Interface(_abi) as ArbSysMockInterface;
  }
  static connect(address: string, signerOrProvider: Signer | Provider): ArbSysMock {
    return new Contract(address, _abi, signerOrProvider) as ArbSysMock;
  }
}
