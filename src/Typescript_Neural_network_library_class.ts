import * as fs from 'fs';
import * as path from 'path';
import { Layer, Network, Trainer } from 'synaptic';
import { LearningDataInterface, OutputTrainingDataInterface, CandleDataInterface, CandleInterface, TrainingDataInterface, PositionType } from "./Interfaces";
import * as cliProgress from 'cli-progress';

export default class TypescriptNeuralNetwork {
    private learningData: TrainingDataInterface[];
    private inputLayer: Layer;
    private hiddenLayers: Layer[];
    private outputLayer: Layer;
    private network: Network;
    private trainer: Trainer;
    private brainFile: string;

    constructor(filePath: string, inputLayerSize: number, hiddenLayersSizes: number[], outputLayerSize: number, brainDataFilePath: string) {
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
}
