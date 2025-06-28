import { Message } from "discord.js";
import adze from "adze";

interface UserRateLimit {
    userId: string;
    requests: number;
    windowStart: number;
    queuedTasks: Array<{
        task: () => Promise<void>;
        timestamp: number;
    }>;
}

export class RateLimitService {
    private readonly logger = adze.withEmoji.timestamp.seal();
    private userLimits: Map<string, UserRateLimit> = new Map();
    private readonly windowMs = 60000; // 1 minute in milliseconds
    private requestsPerMinute: number;
    private limitedRequestsPerMinute: number;
    private limitedUserIds: string[];
    private cleanupInterval: number | undefined;

    constructor(requestsPerMinute: number, limitedUserIds: string[]) {
        this.requestsPerMinute = requestsPerMinute;
        this.limitedRequestsPerMinute = Math.floor(requestsPerMinute / 2);
        this.limitedUserIds = limitedUserIds;
        this.startCleanupInterval();
    }

    /**
     * Check if a user can make a request
     * @returns true if allowed, false if rate limited
     */
    canMakeRequest(userId: string): boolean {
        const now = Date.now();
        const userLimit = this.userLimits.get(userId);
        const isLimitedUser = this.limitedUserIds.includes(userId);
        const maxRequests = isLimitedUser ? this.limitedRequestsPerMinute : this.requestsPerMinute;

        if (!userLimit) {
            // First request from this user
            this.userLimits.set(userId, {
                userId,
                requests: 1,
                windowStart: now,
                queuedTasks: [],
            });
            return true;
        }

        // Check if the window has expired
        if (now - userLimit.windowStart >= this.windowMs) {
            // Reset the window
            userLimit.requests = 1;
            userLimit.windowStart = now;
            return true;
        }

        // Check if user has exceeded the limit
        if (userLimit.requests >= maxRequests) {
            return false;
        }

        // Increment the request count
        userLimit.requests++;
        return true;
    }

    /**
     * Get the time until the rate limit resets for a user
     */
    getTimeUntilReset(userId: string): number {
        const userLimit = this.userLimits.get(userId);
        if (!userLimit) return 0;

        const now = Date.now();
        const timeElapsed = now - userLimit.windowStart;
        const timeRemaining = this.windowMs - timeElapsed;

        return Math.max(0, timeRemaining);
    }

    /**
     * Queue a task to be executed when the rate limit resets
     */
    queueTask(userId: string, task: () => Promise<void>): void {
        const userLimit = this.userLimits.get(userId);
        if (!userLimit) return;

        userLimit.queuedTasks.push({
            task,
            timestamp: Date.now(),
        });

        // Schedule the task execution
        const timeUntilReset = this.getTimeUntilReset(userId);
        setTimeout(() => {
            this.processQueuedTasks(userId);
        }, timeUntilReset);
    }

    /**
     * Process queued tasks for a user
     */
    private async processQueuedTasks(userId: string): Promise<void> {
        const userLimit = this.userLimits.get(userId);
        if (!userLimit || userLimit.queuedTasks.length === 0) return;

        // Get the oldest task
        const oldestTask = userLimit.queuedTasks.shift();
        if (!oldestTask) return;

        try {
            // Reset the user's rate limit for this new window
            userLimit.requests = 1;
            userLimit.windowStart = Date.now();

            // Execute the task
            await oldestTask.task();

            this.logger.info(`Processed queued task for user ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to process queued task for user ${userId}:`, error);
        }
    }

    /**
     * Send a rate limit notification to the user
     */
    async sendRateLimitNotification(message: Message): Promise<void> {
        const timeUntilReset = this.getTimeUntilReset(message.author.id);
        const seconds = Math.ceil(timeUntilReset / 1000);

        try {
            // Send a reply that auto-deletes after 5 seconds
            const reply = await message.reply({
                content: `⏱️ Rate limited. Try again in ${seconds}s.`,
            });
            setTimeout(() => {
                reply.delete().catch(() => {});
            }, 5000);
        } catch (e) {
            this.logger.error("Failed to send rate limit notification:", e);
        }
    }

    /**
     * Update the rate limit
     */
    updateRateLimit(newLimit: number): void {
        this.requestsPerMinute = newLimit;
        this.logger.info(`Rate limit updated to ${newLimit} requests per minute`);
    }

    /**
     * Get current rate limit
     */
    getRateLimit(): number {
        return this.requestsPerMinute;
    }

    /**
     * Clean up expired rate limit entries
     */
    private cleanup(): void {
        const now = Date.now();
        const expiredUsers: string[] = [];

        for (const [userId, userLimit] of this.userLimits) {
            // Remove entries that have been inactive for more than 5 minutes
            if (now - userLimit.windowStart > 5 * this.windowMs && userLimit.queuedTasks.length === 0) {
                expiredUsers.push(userId);
            }
        }

        for (const userId of expiredUsers) {
            this.userLimits.delete(userId);
        }

        if (expiredUsers.length > 0) {
            this.logger.debug(`Cleaned up ${expiredUsers.length} expired rate limit entries`);
        }
    }

    /**
     * Start the cleanup interval
     */
    private startCleanupInterval(): void {
        // Run cleanup every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }

    /**
     * Stop the cleanup interval
     */
    dispose(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}
