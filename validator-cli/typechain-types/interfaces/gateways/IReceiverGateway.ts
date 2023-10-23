/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import type { BaseContract, BigNumber, BytesLike, CallOverrides, PopulatedTransaction, Signer, utils } from "ethers";
import type { FunctionFragment, Result } from "@ethersproject/abi";
import type { Listener, Provider } from "@ethersproject/providers";
import type { TypedEventFilter, TypedEvent, TypedListener, OnEvent, PromiseOrValue } from "../../common";

export interface IReceiverGatewayInterface extends utils.Interface {
  functions: {
    "senderGateway()": FunctionFragment;
    "veaOutbox()": FunctionFragment;
  };

  getFunction(nameOrSignatureOrTopic: "senderGateway" | "veaOutbox"): FunctionFragment;

  encodeFunctionData(functionFragment: "senderGateway", values?: undefined): string;
  encodeFunctionData(functionFragment: "veaOutbox", values?: undefined): string;

  decodeFunctionResult(functionFragment: "senderGateway", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "veaOutbox", data: BytesLike): Result;

  events: {};
}

export interface IReceiverGateway extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: IReceiverGatewayInterface;

  queryFilter<TEvent extends TypedEvent>(
    event: TypedEventFilter<TEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TEvent>>;

  listeners<TEvent extends TypedEvent>(eventFilter?: TypedEventFilter<TEvent>): Array<TypedListener<TEvent>>;
  listeners(eventName?: string): Array<Listener>;
  removeAllListeners<TEvent extends TypedEvent>(eventFilter: TypedEventFilter<TEvent>): this;
  removeAllListeners(eventName?: string): this;
  off: OnEvent<this>;
  on: OnEvent<this>;
  once: OnEvent<this>;
  removeListener: OnEvent<this>;

  functions: {
    senderGateway(overrides?: CallOverrides): Promise<[string]>;

    veaOutbox(overrides?: CallOverrides): Promise<[string]>;
  };

  senderGateway(overrides?: CallOverrides): Promise<string>;

  veaOutbox(overrides?: CallOverrides): Promise<string>;

  callStatic: {
    senderGateway(overrides?: CallOverrides): Promise<string>;

    veaOutbox(overrides?: CallOverrides): Promise<string>;
  };

  filters: {};

  estimateGas: {
    senderGateway(overrides?: CallOverrides): Promise<BigNumber>;

    veaOutbox(overrides?: CallOverrides): Promise<BigNumber>;
  };

  populateTransaction: {
    senderGateway(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    veaOutbox(overrides?: CallOverrides): Promise<PopulatedTransaction>;
  };
}
