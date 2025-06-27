import { Client, Guild, GuildMember, Role } from "npm:discord.js";

const PREMIUM_GUILD_ID = "1304097485136072714";
const PREMIUM_ROLE_ID = "1387978615450239149";

export class PremiumService {
    private static instance: PremiumService;
    private premiumRole: Role | undefined;
    private premiumGuild: Guild | undefined;

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
    }

    public async isPremium(member: GuildMember): Promise<boolean> {
        // override for vagabondtruffle
        if (member.id == "1372957695413452900")
            return true;

        // check premium role in guild
        if (!this.premiumRole) {
            return false;
        }
        return member.roles.cache.has(this.premiumRole.id);
    }
}
