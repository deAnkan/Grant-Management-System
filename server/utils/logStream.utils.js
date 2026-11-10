import fs from "fs";
import path from "path";
import { Writable } from "stream";

/**
 * Size-based rotating file stream.
 *
 * Keeps at most `maxFiles` archives (`file.log.1`, `file.log.2`, ...) and a
 * single active file, so logs can never grow without bound and fill the disk.
 */
export class RotatingFileStream extends Writable {
  constructor(filePath, { maxBytes = 10 * 1024 * 1024, maxFiles = 5 } = {}) {
    super();
    this.filePath = filePath;
    this.maxBytes = Math.max(Number(maxBytes) || 10 * 1024 * 1024, 64 * 1024);
    this.maxFiles = Math.max(Number(maxFiles) || 5, 1);
    this.currentSize = 0;
    this.stream = null;
    this.ready = this.#open();
  }

  async #open() {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const stat = await fs.promises.stat(this.filePath);
      this.currentSize = stat.size;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.currentSize = 0;
    }

    this.#createStream();
  }

  #createStream() {
    this.stream = fs.createWriteStream(this.filePath, { flags: "a" });
    this.stream.on("error", (error) => this.destroy(error));
  }

  async #rotate() {
    const activeStream = this.stream;
    if (!activeStream) return;

    await new Promise((resolve, reject) => {
      activeStream.once("error", reject);
      activeStream.end(resolve);
    });

    this.stream = null;

    for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
      const source = index === 1 ? this.filePath : `${this.filePath}.${index - 1}`;
      const destination = `${this.filePath}.${index}`;

      try {
        await fs.promises.rename(source, destination);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }

    this.currentSize = 0;
    this.#createStream();
  }

  _write(chunk, encoding, callback) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);

    this.ready = this.ready
      .then(async () => {
        if (this.currentSize + buffer.length > this.maxBytes) {
          await this.#rotate();
        }

        await new Promise((resolve, reject) => {
          this.stream.write(buffer, (error) => (error ? reject(error) : resolve()));
        });

        this.currentSize += buffer.length;
      })
      .then(
        () => callback(),
        (error) => callback(error),
      );
  }

  _final(callback) {
    this.ready.then(() => {
      if (!this.stream) return callback();
      this.stream.end(callback);
    }, callback);
  }
}

/**
 * Read the last `maxLines` lines of a file without loading the whole file into
 * memory. Reads at most `maxBytes` from the end of the file.
 */
export const readLastLines = async (filePath, maxLines = 100, maxBytes = 256 * 1024) => {
  const stat = await fs.promises.stat(filePath);
  const start = Math.max(0, stat.size - Math.max(Number(maxBytes) || 256 * 1024, 1024));

  if (stat.size === 0) return "";

  const chunks = [];
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { start, end: stat.size - 1 });
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  const lines = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);

  // If we started mid-file, the first line is likely partial.
  if (start > 0) lines.shift();

  const requestedLines = Math.min(Math.max(Number(maxLines) || 100, 1), 1000);
  return lines.slice(-requestedLines).join("\n");
};
