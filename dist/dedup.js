function normalizeDistanceUnit(unit) {
    if (!unit)
        return 'mi';
    const lower = unit.toLowerCase().trim();
    if (lower === 'km' || lower === 'kilometers' || lower === 'kilometer')
        return 'km';
    return 'mi';
}
function descriptionsMatch(a, b) {
    if (!a || !b)
        return false;
    const na = a.toLowerCase().trim();
    const nb = b.toLowerCase().trim();
    if (na === nb)
        return true;
    const wordsA = new Set(na.split(/\s+/));
    const wordsB = new Set(nb.split(/\s+/));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size > 0 && intersection.length / union.size > 0.6;
}
/**
 * Check if a new activity is a duplicate of any existing activity.
 * Returns the matched existing activity, or undefined if no duplicate.
 */
export function isDuplicate(newActivity, existingActivities, config) {
    for (const existing of existingActivities) {
        if (newActivity.date !== existing.date)
            continue;
        if (newActivity.type.toLowerCase() !== existing.type.toLowerCase())
            continue;
        const bothLackMetrics = (newActivity.duration == null && existing.duration == null) &&
            (newActivity.distance == null && existing.distance == null);
        if (bothLackMetrics) {
            if (!descriptionsMatch(newActivity.description, existing.description))
                continue;
            return existing;
        }
        if ((newActivity.duration != null) !== (existing.duration != null))
            continue;
        if ((newActivity.distance != null) !== (existing.distance != null))
            continue;
        if (newActivity.duration != null && existing.duration != null) {
            const tolerance = config.durationTolerancePercent / 100;
            const diff = Math.abs(newActivity.duration - existing.duration);
            const max = Math.max(newActivity.duration, existing.duration);
            if (max > 0 && diff / max > tolerance)
                continue;
        }
        if (newActivity.distance != null && existing.distance != null) {
            const newUnit = normalizeDistanceUnit(newActivity.distanceUnit);
            const existingUnit = normalizeDistanceUnit(existing.distanceUnit);
            if (newUnit !== existingUnit)
                continue;
            const tolerance = config.distanceTolerancePercent / 100;
            const diff = Math.abs(newActivity.distance - existing.distance);
            const max = Math.max(newActivity.distance, existing.distance);
            if (max > 0 && diff / max > tolerance)
                continue;
        }
        return existing;
    }
    return undefined;
}
//# sourceMappingURL=dedup.js.map