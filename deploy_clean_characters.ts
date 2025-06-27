const cleanCharacters = [
    "byakuren_hijiri.png",
    "danya.png",
    "hakurei_reimu.png",
    "kaguya.png",
    "kogasa.png",
    "mamizou_futatsuiwa.png",
    "marisa.png",
    "mima.png",
    "mokou.png",
    "seija_kijin.png",
    "youmu.png",
    "yukari_yakumo.png",
    "yuyuko.png",
    "Assistant.json",
    "bella.png",
    "bonnie.png",
    "dark_goldie.png",
    "dawn.png",
    "emotional_support_pudding.png",
    "firefly.png",
    "goldie.png",
    "kazusa.png",
    "kiana.png",
    "konar_quo_maten.png",
    "miku_hatsune.png",
    "noelle-holiday.png",
    "pharah.png",
    "ririko.png",
    "ruukoto.png",
    "sans.png",
    "sexy_corn.png",
    "tamamo.png",
    "the_durian.png",
    "viagra_chicken.png",
    "wendy.png",
    "yebin.png",
    "zucchini.png",
];

async function deployCleanCharacters() {
    const tempDir = await Deno.makeTempDir();

    for (const characterFile of cleanCharacters) {
        const remotePath = `/root/discordlm/qa/characters/${characterFile}`;
        const localPath = `${tempDir}/${characterFile}`;

        const scpCommand = new Deno.Command("scp", {
            args: [`-i`, `${Deno.env.get("HOME")}/.ssh/id_rsa`, `root@giga.pingas.org:${remotePath}`, localPath],
        });
        const { success, stderr } = await scpCommand.output();
        if (!success) {
            console.error(`Failed to copy ${characterFile}: ${new TextDecoder().decode(stderr)}`);
            return;
        }
    }

    const scpCommand = new Deno.Command("scp", {
        args: [`-i`, `${Deno.env.get("HOME")}/.ssh/discordlm_qa_ed25519`, `-r`, `${tempDir}/.`, `heni@ooo.observer:/home/heni/discordlm/characters/`],
    });
    const { success, stderr } = await scpCommand.output();
    if (!success) {
        console.error(`Failed to copy characters to QA server: ${new TextDecoder().decode(stderr)}`);
        return;
    }

    const sshCommand = new Deno.Command("ssh", {
        args: [`-i`, `${Deno.env.get("HOME")}/.ssh/discordlm_qa_ed25519`, `heni@ooo.observer`, `systemctl --user restart discordlm.service`],
    });
    const { success: sshSuccess, stderr: sshStderr } = await sshCommand.output();
    if (!sshSuccess) {
        console.error(`Failed to restart service on QA server: ${new TextDecoder().decode(sshStderr)}`);
        return;
    }

    console.log("Clean characters deployed successfully.");
    await Deno.remove(tempDir, { recursive: true });
}

deployCleanCharacters();