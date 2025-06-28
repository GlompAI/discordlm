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
        this.logger.info(`Checking premium for member: ${member?.displayName ?? "undefined"}`);
        if (!this.guild) {
            this.logger.error("Premium guild not found, defaulting to premium.");
            return true;
        }
        this.logger.info(`Premium guild found: ${this.guild.name}`);
        if (!member) {
            this.logger.warn("Could not find member in premium guild, defaulting to premium.");
            return true;
        }
        this.logger.info(`Member found: ${member.displayName}`);
        // override for vagabondtruffle
        if (member.user.id == "1372957695413452900") {
            this.logger.info("Overriding premium for bot owner");
            return true;
        }

        const roles = member.roles.cache.map(role => role.id);
        this.logger.info(`Member roles: ${roles.join(", ")}`);

        if (member.roles.cache.has("1387978615450239149")) {
            this.logger.info(`Premium access granted for user: ${member.displayName}`);
            return true;
        }
        if (member.roles.cache.has("1388224070528532671")) {
            this.logger.info(`Donator access granted for user: ${member.displayName}`);
            return true;
        }
        this.logger.error(`No premium found for user: ${member.displayName}`);
        return false;
    }
}
