/**
 * Format a confirmation message for a logged activity.
 */
export function formatConfirmation(activity) {
    const parts = [];
    parts.push(`✅ Logged: ${formatActivitySummary(activity)}`);
    return parts.join('');
}
/**
 * Format a duplicate warning message.
 */
export function formatDuplicateWarning(newActivity, existing) {
    return (`⚠️ This looks similar to an already logged activity: ${formatActivitySummary(existing)}. ` +
        `Should I log \"${formatActivitySummary(newActivity)}\" as a separate activity? Reply yes/no.`);
}
/**
 * Format a brief activity summary.
 */
export function formatActivitySummary(activity) {
    const parts = [];
    if (activity.duration) {
        parts.push(`${activity.duration}min`);
    }
    parts.push(activity.type);
    if (activity.distance) {
        parts.push(`(${activity.distance} ${activity.distanceUnit || 'mi'})`);
    }
    if (activity.people.length > 0) {
        parts.push(`with ${activity.people.join(', ')}`);
    }
    return parts.join(' ');
}
/**
 * Build the system context injection for a confirmed activity log.
 */
export function buildLoggedContext(activity) {
    return (`[Vitals Logger] An activity was automatically detected and logged from this conversation. ` +
        `Briefly acknowledge it to the user: \"${formatConfirmation(activity)}\"`);
}
/**
 * Build the system context injection for a pending duplicate.
 */
export function buildDuplicateContext(newActivity, existing) {
    return (`[Vitals Logger] A potential duplicate activity was detected. ` +
        `Ask the user: \"${formatDuplicateWarning(newActivity, existing)}\" ` +
        `If the user confirms, the activity will be logged on the next message.`);
}
/**
 * Build system context to check for duplicate confirmation response.
 */
export function buildPendingCheckContext() {
    return (`[Vitals Logger] There is a pending activity that was flagged as a potential duplicate. ` +
        `If the user's message is confirming they want to log it (yes, sure, log it, etc.), ` +
        `the system will automatically commit it.`);
}
//# sourceMappingURL=formatter.js.map