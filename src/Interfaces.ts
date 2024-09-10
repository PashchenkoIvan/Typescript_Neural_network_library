export type PositionType =
    | "SHORT"
    | "LONG"
    | "NO"


export interface LearningDataInterface {
    symbol: string;
    interval: string;
    candles: CandleDataInterface[];
}

export interface OutputTrainingDataInterface {
    positionType: PositionType;
    takeProfitPrice: number;
    stopLossPrice: number;
}

export interface TrainingDataInterface {
    input: LearningDataInterface;
    output: OutputTrainingDataInterface;
}

export interface CandleDataInterface {
    candle: CandleInterface;
    sma_short: number;
    sma_long: number;
    rsi: number;
    btc_correlation: number;
}

export interface CandleInterface {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    closeTime: number;
    quoteVolume: number;
    trades: number;
    baseAssetVolume: number;
    quoteAssetVolume: number;
}