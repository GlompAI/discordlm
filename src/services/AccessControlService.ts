import { configService } from "./ConfigService.ts";
import adze from "adze";
import { GuildMember } from "discord.js";
import { PremiumService } from "./PremiumService.ts";

class AccessControlService {
    private readonly logger = adze.withEmoji.timestamp.seal();
    private readonly adminOverrideUsers: Set<string>;

    constructor() {
        this.adminOverrideUsers = new Set(configService.getAdminOverrideList());
    }

    public async isUserAllowed(member: GuildMember | null): Promise<boolean> {
        if (!member) {
            return false;
        }

        if (member.id === configService.botSelfId) {
            return true;
        }
        this.logger.info(`Checking access for user ${member.id}`);

        if (this.adminOverrideUsers.has(member.id)) {
            this.logger.info(`User ${member.id} is an admin override. Access granted.`);
            return true;
        }

        if (member.guild) {
            this.logger.info(`User ${member.id} is in a guild. Access granted.`);
            return true;
        }

        const premiumService = PremiumService.getInstance();
        if (await premiumService.isPremium(member)) {
            this.logger.info(`User ${member.id} is a premium user. Access granted.`);
            return true;
        }

        this.logger.info(`User ${member.id} is in a DM and not a premium user. Access denied.`);
        return false;
    }
}

export const accessControlService = new AccessControlService();
