import { configService } from "./ConfigService.ts";

class AccessControlService {
    private readonly allowedUsers: Set<string>;
    private readonly isWhitelist: boolean;

    constructor() {
        const userIdList = configService.getUserIdList();
        this.allowedUsers = new Set(userIdList.split(";").filter((id: string) => id.trim() !== ""));
        this.isWhitelist = configService.isWhitelistEnabled();
    }

    public isUserAllowed(userId: string): boolean {
        if (this.allowedUsers.size === 0) {
            return true;
        }

        const isUserInList = this.allowedUsers.has(userId);

        if (this.isWhitelist) {
            return isUserInList;
        } else {
            return !isUserInList;
        }
    }
}

export const accessControlService = new AccessControlService();
