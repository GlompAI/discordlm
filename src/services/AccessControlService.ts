import { configService } from "./ConfigService.ts";

class AccessControlService {
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
        if (this.adminOverrideUsers.has(userId)) {
            return true;
        }

        if (!this.isWhitelist) {
            return true;
        }

        if (this.allowedUsers.size === 0) {
            return false;
        }

        return this.allowedUsers.has(userId);
    }
}

export const accessControlService = new AccessControlService();
