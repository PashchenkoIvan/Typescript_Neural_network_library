import * as fs from 'fs';
import { Layer, Network, Trainer } from 'synaptic';
import { LearningDataInterface, OutputTrainingDataInterface, CandleDataInterface, CandleInterface, TrainingDataInterface, PositionType, LimitOptions, MarketOptions } from "./Interfaces";
import * as cliProgress from 'cli-progress';
import {CandleChartInterval_LT} from "binance-api-node";
import {parse} from "date-fns";

export default class TypescriptNeuralNetwork {
    private client;
    private learningData: TrainingDataInterface[];
    private inputLayer: Layer;
    private hiddenLayers: Layer[];
    private outputLayer: Layer;
    private network: Network;
    private trainer: Trainer;
    private brainFile: string;

    constructor(Binance, filePath: string, inputLayerSize: number, hiddenLayersSizes: number[], outputLayerSize: number, brainDataFilePath: string) {
        this.client = Binance
        this.inputLayer = new Layer(inputLayerSize);
        this.hiddenLayers = hiddenLayersSizes.map(size => new Layer(size));
        this.outputLayer = new Layer(outputLayerSize);

        // Connect layers
        this.inputLayer.project(this.hiddenLayers[0]);
        for (let i = 0; i < this.hiddenLayers.length - 1; i++) {
            this.hiddenLayers[i].project(this.hiddenLayers[i + 1]);
        }
        this.hiddenLayers[this.hiddenLayers.length - 1].project(this.outputLayer);

        // Create network
        this.network = new Network({
            input: this.inputLayer,
            hidden: this.hiddenLayers,
            output: this.outputLayer
        });

        // Create trainer
        this.trainer = new Trainer(this.network);

        // Load learning data
        this.learningData = this.loadLearningData(filePath);

        // Set brain file path
        this.brainFile = brainDataFilePath;
    }

    private loadLearningData(filePath: string): TrainingDataInterface[] {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify([]));
            console.log(`File not found. Created new file at ${filePath}`);
            return [];
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(fileContent) as TrainingDataInterface[];
    }

    public trainNetwork(learningRate: number, iterations: number): void {
        const trainingSet = this.learningData.map(data => ({
            input: this.flattenInput(data.input),
            output: this.flattenOutput(data.output)
        }));

        // Create progress bar
        const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progressBar.start(iterations, 0);

        this.trainer.train(trainingSet, {
            rate: learningRate,
            iterations: iterations,
            error: 0.005,
            shuffle: true,
            log: 100,
            cost: Trainer.cost.CROSS_ENTROPY,
            schedule: {
                every: 1,
                do: (data) => {
                    progressBar.update(data.iterations);
                }
            }
        });

        progressBar.stop();
        console.log('Training completed');

        // Save the trained network
        this.saveNetwork();
    }

    private flattenInput(input: LearningDataInterface): number[] {
        return input.candles.flatMap(candle => [
            candle.candle.open,
            candle.candle.high,
            candle.candle.low,
            candle.candle.close,
            candle.sma_short,
            candle.sma_long,
            candle.rsi,
            candle.btc_correlation
        ]);
    }

    private flattenOutput(output: OutputTrainingDataInterface): number[] {
        return [
            output.positionType === "LONG" ? 1 : 0,
            output.positionType === "SHORT" ? 1 : 0,
            output.positionType === "NO" ? 1 : 0,
            output.takeProfitPrice,
            output.stopLossPrice
        ];
    }

    private unflattenOutput(output: number[]): OutputTrainingDataInterface {
        const positionType = output[0] === 1 ? "LONG" : output[1] === 1 ? "SHORT" : "NO";
        return {
            positionType: positionType as PositionType,
            takeProfitPrice: output[3],
            stopLossPrice: output[4]
        };
    }

    public predict(inputData: LearningDataInterface): OutputTrainingDataInterface {
        const input = this.flattenInput(inputData);
        const output = this.network.activate(input);

        return this.unflattenOutput(output);
    }

    private saveNetwork(): void {
        const networkState = this.network.toJSON();
        fs.writeFileSync(this.brainFile, JSON.stringify(networkState));
        console.log(`Network state saved to ${this.brainFile}`);
    }

    public loadNetwork(): void {
        if (!fs.existsSync(this.brainFile)) {
            console.log(`Brain file not found at ${this.brainFile}`);
            return;
        }

        const networkState = JSON.parse(fs.readFileSync(this.brainFile, 'utf-8'));
        this.network = Network.fromJSON(networkState); // Correctly using the static method
        console.log(`Network state loaded from ${this.brainFile}`);
    }

    private async fetchCandles(symbol: string, interval: CandleChartInterval_LT, limit: number, endTime: number): Promise<CandleInterface[]> {
        const candles = await this.client.futuresCandles({
            symbol: symbol,
            interval: interval,
            limit: limit,
            endTime: endTime
        });
        return candles.map(candle => ({
            openTime: candle.openTime,
            open: parseFloat(candle.open),
            high: parseFloat(candle.high),
            low: parseFloat(candle.low),
            close: parseFloat(candle.close),
            volume: parseFloat(candle.volume),
            closeTime: candle.closeTime,
            quoteVolume: parseFloat(candle.quoteVolume),
            trades: candle.trades,
            baseAssetVolume: parseFloat(candle.baseAssetVolume),
            quoteAssetVolume: parseFloat(candle.quoteAssetVolume),
        }));
    }

    private calculateSMA(candles: CandleInterface[], period: number): number[] {
        let sma: number[] = [];
        for (let i = 0; i < candles.length; i++) {
            if (i < period - 1) {
                sma.push(0);
            } else {
                let sum = 0;
                for (let j = 0; j < period; j++) {
                    sum += candles[i - j].close;
                }
                sma.push(sum / period);
            }
        }
        return sma;
    }

    private calculateRSI(candles: CandleInterface[], period: number): number[] {
        let rsi: number[] = [];
        let gains = 0;
        let losses = 0;

        for (let i = 1; i < candles.length; i++) {
            let change = candles[i].close - candles[i - 1].close;
            if (change > 0) {
                gains += change;
            } else {
                losses -= change;
            }

            if (i >= period) {
                let avgGain = gains / period;
                let avgLoss = losses / period;
                let rs = avgGain / avgLoss;
                rsi.push(100 - (100 / (1 + rs)));

                let prevChange = candles[i - period + 1].close - candles[i - period].close;
                if (prevChange > 0) {
                    gains -= prevChange;
                } else {
                    losses += prevChange;
                }
            } else {
                rsi.push(0);
            }
        }
        return rsi;
    }

    private calculateCorrelation(candles: CandleInterface[], btcCandles: CandleInterface[]): number[] {
        let correlation: number[] = [];
        for (let i = 0; i < candles.length; i++) {
            if (i < btcCandles.length) {
                let cov = 0;
                let varA = 0;
                let varB = 0;
                let meanA = candles.slice(0, i + 1).reduce((sum, candle) => sum + candle.close, 0) / (i + 1);
                let meanB = btcCandles.slice(0, i + 1).reduce((sum, candle) => sum + candle.close, 0) / (i + 1);

                for (let j = 0; j <= i; j++) {
                    cov += (candles[j].close - meanA) * (btcCandles[j].close - meanB);
                    varA += Math.pow(candles[j].close - meanA, 2);
                    varB += Math.pow(btcCandles[j].close - meanB, 2);
                }

                correlation.push(cov / Math.sqrt(varA * varB));
            } else {
                correlation.push(0);
            }
        }
        return correlation;
    }

    private calculateIndicators(candles: CandleInterface[], btcCandles: CandleInterface[]): CandleDataInterface[] {
        const smaShort = this.calculateSMA(candles, 50);
        const smaLong = this.calculateSMA(candles, 200);
        const rsi = this.calculateRSI(candles, 14);
        const btcCorrelation = this.calculateCorrelation(candles, btcCandles);

        return candles.map((candle, index) => ({
            candle,
            sma_short: smaShort[index],
            sma_long: smaLong[index],
            rsi: rsi[index],
            btc_correlation: btcCorrelation[index],
        }));
    }

    private parseDateTime(dateTime: string): number {
        return parse(dateTime, 'yyyy-MM-dd HH:mm:ss', new Date()).getTime();
    }

    public async addMarketTrainingData(filePath: string, option: MarketOptions) {
        const endTime = this.parseDateTime(option.endTime);

        const candles = await this.fetchCandles(option.symbol, option.interval, option.limit, endTime);
        const btcCandles = await this.fetchCandles("BTCUSDT", option.interval, option.limit, endTime);
        const candleData = this.calculateIndicators(candles, btcCandles);

        const trainingData: TrainingDataInterface = {
            input: {
                symbol: option.symbol,
                interval: option.interval,
                candles: candleData
            },
            output: {
                positionType: option.positionType,
                takeProfitPrice: option.takeProfitPrice,
                stopLossPrice: option.stopLossPrice,
            },
        };

        let data = [];

        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            data = JSON.parse(fileContent);
        }

        data.push(trainingData);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

    public async addLimitTrainingData(filePath: string, option: LimitOptions) {
        const endTime = this.parseDateTime(option.endTime);

        const candles = await this.fetchCandles(option.symbol, option.interval, option.limit, endTime);
        const btcCandles = await this.fetchCandles("BTCUSDT", option.interval, option.limit, endTime);
        const candleData = this.calculateIndicators(candles, btcCandles);

        const trainingData: TrainingDataInterface = {
            input: {
                symbol: option.symbol,
                interval: option.interval,
                candles: candleData,
            },
            output: {
                positionType: option.positionType,
                takeProfitPrice: option.takeProfitPrice,
                stopLossPrice: option.stopLossPrice,
            },
        };

        let data = [];

        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            data = JSON.parse(fileContent);
        }

        data.push(trainingData);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
}


