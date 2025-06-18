export async function replaceAllAsync(
    input: string,
    regex: RegExp,
    replacer: (match: string, ...groups: string[]) => Promise<string>,
): Promise<string> {
    const replacements = [];
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(input)) !== null) {
        const [fullMatch, ...groups] = match;
        const matchIndex = match.index;

        // Add text before match
        replacements.push(input.slice(lastIndex, matchIndex));

        // Add async replacement
        replacements.push(replacer(fullMatch, ...groups));

        lastIndex = regex.lastIndex;
    }

    // Add remaining text
    replacements.push(input.slice(lastIndex));

    // Wait for all replacements and join
    const resolved = await Promise.all(replacements);
    return resolved.join("");
}
