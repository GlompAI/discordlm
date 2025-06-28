import { Client, Guild, GuildMember, Role } from "discord.js";
import adze from "adze";

export class PremiumService {
    private static instance: PremiumService;
    public client: Client | undefined;

    private constructor() {}

    public static getInstance(): PremiumService {
        if (!PremiumService.instance) {
            PremiumService.instance = new PremiumService();
        }
        return PremiumService.instance;
    }

    public async init(client: Client) {
        this.client = client;
    }

    public async isPremium(member: GuildMember): Promise<boolean> {
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
