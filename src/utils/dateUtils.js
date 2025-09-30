// Date utility functions for handling date ranges and formatting

/**
 * Get today's date range
 * @returns {Object} Object with startISO and endISO
 */
export function getTodayRange() {
  const now = new Date();
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0); // Start of today

  return {
    startISO: startDate.toISOString(),
    endISO: now.toISOString(),
    startDate,
    endDate: now
  };
}

/**
 * Get yesterday's date range
 * @returns {Object} Object with startISO and endISO
 */
export function getYesterdayRange() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  
  const endDate = new Date(yesterday);
  endDate.setHours(23, 59, 59, 999);

  return {
    startISO: yesterday.toISOString(),
    endISO: endDate.toISOString(),
    startDate: yesterday,
    endDate: endDate
  };
}

/**
 * Get custom date range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Object} Object with startISO and endISO
 */
export function getCustomRange(startDate, endDate) {
  return {
    startISO: startDate.toISOString(),
    endISO: endDate.toISOString(),
    startDate,
    endDate
  };
}

/**
 * Format date for display
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
  const d = new Date(date);
  return d.toISOString().substring(0, 10);
}

/**
 * Check if date is within range
 * @param {Date|string} date - Date to check
 * @param {Date} startDate - Range start
 * @param {Date} endDate - Range end
 * @returns {boolean} True if date is within range
 */
export function isDateInRange(date, startDate, endDate) {
  const d = new Date(date);
  return d >= startDate && d <= endDate;
}
