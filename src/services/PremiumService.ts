import { Client, Guild, GuildMember } from "discord.js";
import adze from "adze";
import { configService } from "./ConfigService.ts";

export class PremiumService {
    private static instance: PremiumService;
    private readonly logger = adze.withEmoji.timestamp.seal();
    public client: Client | undefined;
    public guild: Guild | undefined;

    private constructor() {}

    public static getInstance(): PremiumService {
        if (!PremiumService.instance) {
            PremiumService.instance = new PremiumService();
        }
        return PremiumService.instance;
    }

    public async init(client: Client) {
        this.client = client;
        try {
            this.guild = await this.client.guilds.fetch({ guild: configService.getPremiumGuildId(), force: true });
        } catch (exception) {
            adze.warn("Premium guild not found! Falling back...");
            console.log(exception);
        }
    }

    public async isPremium(member: GuildMember | undefined): Promise<boolean> {
        if (!this.guild) {
            this.logger.error("Premium guild not found, defaulting to premium.");
            return true;
        }
        if (!member) {
            this.logger.warn("Could not find member in premium guild, defaulting to premium.");
            return true;
        }
        // override for vagabondtruffle
        if (member.user.id == "1372957695413452900") {
            adze.info("Overriding premium for bot owner");
            return true;
        }

        if (member.roles.cache.has("1387978615450239149")) {
            adze.info(`Premium access granted for user: ${member.displayName}`);
            return true;
        }
        if (member.roles.cache.has("1388224070528532671")) {
            adze.info(`Donator access granted for user: ${member.displayName}`);
            return true;
        }
        adze.error(`No premium found for user: ${member.displayName}`);
        return false;
    }
}
