function parseTimeToMinutes(time) {
    const parts = time.split(":");
    const hours = Number(parts[0]);
    const minutes = Number(parts[1] ?? 0);
    return hours * 60 + minutes;
}
function minutesToTimeString(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}
export function generateSlotStartTimes(openTime, closeTime, intervalMins) {
    const slots = [];
    const endMinutes = parseTimeToMinutes(closeTime);
    let current = parseTimeToMinutes(openTime);
    while (current + intervalMins <= endMinutes) {
        slots.push(minutesToTimeString(current));
        current += intervalMins;
    }
    return slots;
}
function combineDateAndTime(date, time) {
    return new Date(`${date}T${time}`);
}
function rangesOverlap(startA, endA, startB, endB) {
    return startA < endB && endA > startB;
}
export function computeAvailableSlots(input) {
    if (input.isClosed) {
        return [];
    }
    const slotStarts = generateSlotStartTimes(input.openTime, input.closeTime, input.intervalMins);
    const closeAt = combineDateAndTime(input.date, input.closeTime);
    const slotsNeeded = Math.ceil(input.serviceDurationMins / input.intervalMins);
    const available = [];
    for (const startTime of slotStarts) {
        const blockStart = combineDateAndTime(input.date, startTime);
        const blockEnd = new Date(blockStart.getTime() + input.serviceDurationMins * 60 * 1000);
        if (blockEnd > closeAt) {
            continue;
        }
        const overlapsBooking = input.bookedRanges.some((booking) => rangesOverlap(blockStart, blockEnd, booking.start, booking.end));
        if (!overlapsBooking) {
            available.push(blockStart.toISOString());
        }
    }
    return available;
}
export function isScheduledAtAvailable(scheduledAt, availableSlots) {
    const target = scheduledAt.getTime();
    return availableSlots.some((slot) => new Date(slot).getTime() === target);
}
export function getDateKeyFromScheduledAt(scheduledAt) {
    return scheduledAt.toISOString().slice(0, 10);
}
export function getDayOfWeekFromDate(date) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
