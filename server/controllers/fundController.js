/**
 * Express Controller for FundPulse API
 */

const amfiService = require('../services/amfiService');
const logger = require('../utils/logger');

/**
 * GET /api/funds
 * Returns paginated schemes with optional category, search, and plan selection
 */
const getFunds = async (req, res) => {
  try {
    const { category, search, plan = 'regular', option = 'all', page = 1, limit = 50, days, customDays, startDate, endDate, asOfDate, calculationDate, date } = req.query;
    const resolvedAsOfDate = asOfDate || calculationDate || date || null;
    
    const result = await amfiService.getFunds({
      category,
      search,
      plan,
      option,
      page,
      limit,
      days: days || customDays,
      startDate,
      endDate,
      asOfDate: resolvedAsOfDate
    });

    const categories = await amfiService.getCategories();

    res.json({
      success: true,
      data: {
        funds: result.funds,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        customDaysList: result.customDaysList,
        categories,
        reportDate: result.reportDate,
        lastUpdated: result.lastUpdated
      }
    });
  } catch (error) {
    logger.error('Error fetching funds in controller:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve mutual fund schemes.',
      message: error.message
    });
  }
};

/**
 * POST /api/funds/batch
 * Resolves full data & calculated returns for Custom Fund List schemes
 */
const getBatchFunds = async (req, res) => {
  try {
    const { ids = [], plan = 'regular', days, customDays, startDate, endDate, asOfDate, calculationDate, date } = req.body;
    const resolvedAsOfDate = asOfDate || calculationDate || date || null;

    const result = await amfiService.getBatchFunds({
      ids,
      plan,
      days: days || customDays,
      startDate,
      endDate,
      asOfDate: resolvedAsOfDate
    });

    res.json({
      success: true,
      data: {
        funds: result.funds,
        total: result.total,
        customDaysList: result.customDaysList,
        reportDate: result.reportDate,
        lastUpdated: result.lastUpdated
      }
    });
  } catch (error) {
    logger.error('Error fetching batch funds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve batch fund details.',
      message: error.message
    });
  }
};

/**
 * GET /api/funds/:id
 * Returns single fund details
 */
const getFundById = async (req, res) => {
  try {
    const { id } = req.params;
    const { plan = 'regular', days, customDays, startDate, endDate, asOfDate, calculationDate, date } = req.query;
    const resolvedAsOfDate = asOfDate || calculationDate || date || null;

    const scheme = amfiService.schemeMap.get(id);

    if (!scheme) {
      return res.status(404).json({
        success: false,
        error: 'Fund scheme not found.'
      });
    }

    const histAumRes = await amfiService.resolveHistoricalAumForSchemes(resolvedAsOfDate, [scheme]);
    const histMatch = histAumRes?.map ? histAumRes.map.get(scheme.id) : null;
    const m = histMatch || scheme.amfiMatch;
    const computed = await amfiService.computeReturnsForScheme(scheme, plan, days || customDays, startDate, endDate, resolvedAsOfDate, histMatch);
    const dailyAUMRaw = (m && m.dailyAUM !== null) ? m.dailyAUM : scheme.dailyAUMRaw;
    const dailyAUMFormatted = (m && m.dailyAUM !== null) ? amfiService.formatAUM(m.dailyAUM) : scheme.dailyAUMFormatted;
    const benchmark = (m && m.benchmark && m.benchmark !== 'N/A') ? m.benchmark : scheme.benchmark;
    const riskometerScheme = (m && m.riskometerScheme && m.riskometerScheme !== 'N/A') ? m.riskometerScheme : scheme.riskometerScheme;

    const isDir = plan.toLowerCase() === 'direct';

    res.json({
      success: true,
      data: {
        fund: {
          id: scheme.id,
          displayName: scheme.displayName,
          amfiSchemeName: scheme.amfiSchemeName,
          category: scheme.category,
          subCategoryId: scheme.subCategoryId,
          amcName: scheme.amcName,
          benchmark,
          riskometerScheme,
          dailyAUMRaw,
          dailyAUMFormatted,
          navRegular: (histMatch && histMatch.navRegular) ? histMatch.navRegular : (isDir ? null : computed.currentNav),
          navDirect: (histMatch && histMatch.navDirect) ? histMatch.navDirect : (isDir ? computed.currentNav : null),
          plan: computed.planUsed,
          currentNav: computed.currentNav || (histMatch && (isDir ? histMatch.navDirect : histMatch.navRegular)),
          navDate: computed.navDate || (histAumRes?.effectiveDate) || (resolvedAsOfDate ? amfiService.formatAmfiDate(amfiService.parseNavDate(resolvedAsOfDate)) : computed.navDate),
          return1Yr: computed.return1Yr,
          return2Yr: computed.return2Yr,
          return3Yr: computed.return3Yr,
          return5Yr: computed.return5Yr,
          return10Yr: computed.return10Yr,
          dayReturns: computed.dayReturns,
          customDaysList: computed.customDaysList,
          ...Object.fromEntries(
            Object.keys(computed)
              .filter(k => k.startsWith('return_'))
              .map(k => [k, computed[k]])
          ),
          return15D: computed.return15D,
          return30D: computed.return30D,
          return45D: computed.return45D,
          return60D: computed.return60D,
          return180D: computed.return180D,
          returnCustomD: computed.returnCustomD,
          customDays: computed.customDays,
          return1YearRegular: histMatch ? histMatch.return1YearRegular : null,
          return1YearDirect: histMatch ? histMatch.return1YearDirect : null,
          return3YearRegular: histMatch ? histMatch.return3YearRegular : null,
          return3YearDirect: histMatch ? histMatch.return3YearDirect : null,
          return5YearRegular: histMatch ? histMatch.return5YearRegular : null,
          return5YearDirect: histMatch ? histMatch.return5YearDirect : null,
          return10YearRegular: histMatch ? histMatch.return10YearRegular : null,
          return10YearDirect: histMatch ? histMatch.return10YearDirect : null,
          return1YearBenchmark: histMatch ? histMatch.benchmarkReturn1Year : null,
          return3YearBenchmark: histMatch ? histMatch.benchmarkReturn3Year : null,
          return5YearBenchmark: histMatch ? histMatch.benchmarkReturn5Year : null,
          return10YearBenchmark: histMatch ? histMatch.benchmarkReturn10Year : null,
          riskometerBenchmark: (histMatch && histMatch.riskometerBenchmark && histMatch.riskometerBenchmark !== 'N/A') ? histMatch.riskometerBenchmark : scheme.riskometerBenchmark,
          preNavRegular: histMatch ? histMatch.preNavRegular : null,
          preNavDirect: histMatch ? histMatch.preNavDirect : null
        },
        reportDate: histAumRes?.effectiveDate || (resolvedAsOfDate ? amfiService.formatAmfiDate(amfiService.parseNavDate(resolvedAsOfDate)) : amfiService.reportDate),
        lastUpdated: amfiService.lastUpdated
      }
    });
  } catch (error) {
    logger.error(`Error fetching fund ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve fund details.',
      message: error.message
    });
  }
};

/**
 * GET /api/categories
 * Returns list of all categories and fund counts
 */
const getCategories = async (req, res) => {
  try {
    const categories = await amfiService.getCategories();
    res.json({
      success: true,
      data: {
        categories,
        totalCategories: categories.length,
        totalFunds: amfiService.masterSchemes.length
      }
    });
  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve categories.'
    });
  }
};

/**
 * GET /api/health
 * Service health check
 */
const getHealth = async (req, res) => {
  try {
    res.json({
      success: true,
      status: 'UP',
      service: 'FundPulse Backend API',
      totalSchemesRegistered: amfiService.masterSchemes.length,
      cachedReportDate: amfiService.reportDate,
      lastCacheUpdate: amfiService.lastUpdated,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'DOWN',
      error: error.message
    });
  }
};

/**
 * POST /api/refresh
 * Force manual refresh of AMFI data & clear NAV cache
 */
const refreshData = async (req, res) => {
  try {
    logger.info('Manual AMFI refresh requested');
    amfiService.isInitialized = false;
    amfiService.inFlightInitPromise = null;
    amfiService.navHistoryCache.clear();
    amfiService.computedCache.clear();

    const latestNavDate = await amfiService.resolveLatestNavDate();
    if (latestNavDate) {
      amfiService.reportDate = latestNavDate;
    }

    await amfiService.initializeMasterRegistry();
    amfiService.lastUpdated = new Date().toISOString();

    res.json({
      success: true,
      message: 'AMFI data and NAV history successfully refreshed.',
      data: {
        totalSchemes: amfiService.masterSchemes.length,
        reportDate: amfiService.reportDate,
        lastUpdated: amfiService.lastUpdated
      }
    });
  } catch (error) {
    logger.error('Manual refresh failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh AMFI data.',
      message: error.message
    });
  }
};

module.exports = {
  getFunds,
  getBatchFunds,
  getFundById,
  getCategories,
  getHealth,
  refreshData
};
