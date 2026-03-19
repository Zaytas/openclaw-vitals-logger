export function formatConfirmation(activity) {
    return `✅ Logged: ${formatActivitySummary(activity)}`;
}
export function formatDuplicateWarning(newActivity, existing) {
    return (`⚠️ This looks similar to an already logged activity: ${formatActivitySummary(existing)}. ` +
        `Should I log "${formatActivitySummary(newActivity)}" as a separate activity? Reply yes/no.`);
}
export function formatActivitySummary(activity) {
    const parts = [];
    if (activity.duration != null && activity.duration >= 0) {
        parts.push(`${activity.duration}min`);
    }
    parts.push(activity.type);
    if (activity.distance != null && activity.distance >= 0) {
        parts.push(`(${activity.distance} ${activity.distanceUnit || 'mi'})`);
    }
    if (activity.people.length > 0) {
        parts.push(`with ${activity.people.join(', ')}`);
    }
    return parts.join(' ');
}
export function buildLoggedContext(activity) {
    return (`[Vitals Logger] An activity was automatically detected and logged from this conversation. ` +
        `Briefly acknowledge it to the user: "${formatConfirmation(activity)}"`);
}
export function buildDuplicateContext(newActivity, existing) {
    return (`[Vitals Logger] A potential duplicate activity was detected. ` +
        `Ask the user: "${formatDuplicateWarning(newActivity, existing)}" ` +
        `If the user confirms, the activity will be logged on the next message.`);
}
//# sourceMappingURL=formatter.js.map