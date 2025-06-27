import { Client, Guild, GuildMember, Role } from "npm:discord.js";
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

        if (member.roles.premiumSubscriberRole) {
            adze.info(`Premium access granted for user: ${member.displayName}`);
            return true;
        }
        adze.error(`No premium found for user: ${member.displayName}`);
        return false;
    }
}
