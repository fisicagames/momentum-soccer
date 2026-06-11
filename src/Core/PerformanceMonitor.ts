/** by Rafael João Ribeiro
 * PerformanceMonitor is a utility class for measuring and reporting the execution time of functions.
 * It allows developers to track performance metrics by recording execution times and calculating 
 * the average over a specified interval. This is useful for identifying performance bottlenecks 
 * and optimizing critical sections of code.
 */
export class PerformanceMonitor {
    private executionTimes: number[] = [];
    private intervalId: number | null = null;
    private functionName: string;
    private interval: number;

    /**
     * @param functionName - The name of the function being monitored.
     * @param interval - The interval (in milliseconds) for calculating and logging the average execution time.
     */
    constructor(functionName: string, interval: number = 10000) {
        this.functionName = functionName;
        this.interval = interval;
    }

    public measureExecution(fn: () => void): void {
        const start = performance.now();
        fn();
        const end = performance.now();
        this.executionTimes.push(end - start);
    }

    public startMonitoring(): void {
        this.intervalId = window.setInterval(() => {
            if (this.executionTimes.length > 0) {
                const sum = this.executionTimes.reduce((acc, time) => acc + time, 0);
                const average = sum / this.executionTimes.length;
                console.log(`Tempo médio de execução de ${this.functionName}: ${average.toFixed(4)} ms`);
                this.executionTimes = [];
            }
        }, this.interval);
    }

    public stopMonitoring(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}