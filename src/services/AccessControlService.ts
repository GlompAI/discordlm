import { configService } from "./ConfigService.ts";
import adze from "npm:adze";

class AccessControlService {
    private readonly logger = adze.withEmoji.timestamp.seal();
    private readonly allowedUsers: Set<string>;
    private readonly isWhitelist: boolean;
    private readonly adminOverrideUsers: Set<string>;

    constructor() {
        const userIdList = configService.getUserIdList();
        this.allowedUsers = new Set(userIdList.split(",").filter((id: string) => id.trim() !== ""));
        this.isWhitelist = configService.isWhitelistEnabled();
        this.adminOverrideUsers = new Set(configService.getAdminOverrideList());
    }

    public isUserAllowed(userId: string): boolean {
        this.logger.info(`Checking access for user ${userId}`);
        this.logger.info(`Whitelist enabled: ${this.isWhitelist}`);
        this.logger.info(`Allowed users: ${[...this.allowedUsers]}`);
        this.logger.info(`Admin override users: ${[...this.adminOverrideUsers]}`);

        if (this.adminOverrideUsers.has(userId)) {
            this.logger.info(`User ${userId} is an admin override. Access granted.`);
            return true;
        }

        if (!this.isWhitelist) {
            this.logger.info("Whitelist is not enabled. Access granted.");
            return true;
        }

        if (this.allowedUsers.size === 0) {
            this.logger.info("Whitelist is enabled, but no users are in the list. Access denied.");
            return false;
        }

        const isAllowed = this.allowedUsers.has(userId);
        this.logger.info(`User ${userId} is in allowed list: ${isAllowed}. Access ${isAllowed ? "granted" : "denied"}.`);
        return isAllowed;
    }
}

export const accessControlService = new AccessControlService();
