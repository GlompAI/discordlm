import { configService } from "./ConfigService.ts";
import adze from "adze";
import { GuildMember } from "discord.js";

class AccessControlService {
    private readonly logger = adze.withEmoji.timestamp.seal();
    private readonly adminOverrideUsers: Set<string>;

    constructor() {
        this.adminOverrideUsers = new Set(configService.getAdminOverrideList());
    }

    public async isUserAllowed(_member: GuildMember | null): Promise<boolean> {
        return true;
    }
}

export const accessControlService = new AccessControlService();
