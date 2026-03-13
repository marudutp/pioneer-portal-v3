export class AudioSystem {
    private static ctx: AudioContext | null = null;
    static async init() {
        if (!this.ctx) this.ctx = new AudioContext();
        if (this.ctx.state !== "running") await this.ctx.resume();
        return this.ctx;
    }
}