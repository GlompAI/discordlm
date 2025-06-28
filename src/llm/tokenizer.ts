import Tokenizer from "llama-tokenizer-js";

export function countTokens(message: string): number {
    if (message == "") return 0;
    return Tokenizer.encode(message).length;
}
