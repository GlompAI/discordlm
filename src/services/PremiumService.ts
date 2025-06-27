import { Client, Guild, GuildMember, Role } from "npm:discord.js";
import adze from "adze";

const PREMIUM_GUILD_ID = "1304097485136072714";
const PREMIUM_ROLE_ID = "1387978615450239149";

export class PremiumService {
    private static instance: PremiumService;
    private premiumRole: Role | undefined;
    private premiumGuild: Guild | undefined;
    public client: Client | undefined;

    private constructor() {}

    public static getInstance(): PremiumService {
        if (!PremiumService.instance) {
            PremiumService.instance = new PremiumService();
        }
        return PremiumService.instance;
    }

    public async init(client: Client) {
        this.premiumGuild = await client.guilds.fetch(PREMIUM_GUILD_ID);
        if (this.premiumGuild) {
            const role = await this.premiumGuild.roles.fetch(PREMIUM_ROLE_ID);
            if (role) {
                this.premiumRole = role;
            }
        }
        this.client = client;
    }

    public async isPremium(member: GuildMember): Promise<boolean> {
        // override for vagabondtruffle
        if (member.user.id == "1372957695413452900") {
            adze.info("Overriding premium for bot owner");
            return true;
        }

        // check premium role in guild
        if (!this.premiumRole) {
            return false;
        }
        const premiumService = PremiumService.getInstance();
        const premiumGuild = await premiumService.client?.guilds.fetch(PREMIUM_GUILD_ID);
        if (!premiumGuild) {
            adze.error("Backing premium guild not found...");
            return true;
        }
        const role = await premiumGuild.roles.fetch(PREMIUM_ROLE_ID);
        if (!role) {
            adze.error("Backing premium role not found...");
            return true;
        }
        if (member.roles.premiumSubscriberRole) {
            adze.error("Member has premium role!");
            return true;
        }
        return false;
    }
}
