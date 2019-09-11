// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

const databaseModule = require('../../lib/database-module');
const gsddModule = require('../../lib/gsdd-module');
const utils = require('../../lib/utils');

class DrugsModel {
  /**
   * @param {databaseModule} [dbModule]
   * @param {gsddModule} [gsdd]
   */
  constructor(dbModule, gsdd) {
    this.dbModule = dbModule || databaseModule;
    this.gsdd = gsdd || gsddModule;

    this.constructSelect = utils.constructSelect.bind(this);
  }

  /**
   * Function for searching drugs in database
   * @param {string} searchQuery query to search in database
   * @param {number} page number of page if result is long
   * @param {number} perPage number of items per page
   * @param {express.response} res response
   */
  searchDrugs(searchQuery, page, perPage, res) {
    let rows = 0;
    let pages = 0;

    const offset = (page - 1) * perPage;

    const where = {full_name: `%${searchQuery}%`};

    this.constructSelect({select: numRows, from: 'drug', where})
        .then(result => {
          rows = result[0].numRows;
          pages = Math.ceil(rows / perPage);
          if (rows !== 0) {
            return this.constructSelect({
              select: all,
              from: 'drug',
              where,
              limit: perPage,
              offset,
            });
          }
        })
        .then(result => {
          if (result) {
            utils.handleResult(result, res, page, pages, null, rows);
          } else {
            utils.fail(res, 404, 'Drug not found');
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Function to get list of drugs from database
   * @param {number} page number of page if result is long
   * @param {number} perPage number of items per page
   * @param {express.response} res response
   */
  getAll(page, perPage, res) {
    let rows = 0;
    let pages = 0;

    const offset = (page - 1) * perPage;

    this.constructSelect({select: numRows, from: 'drug'})
        .then(result => {
          rows = result[0].numRows;
          pages = Math.ceil(rows / perPage);

          if (rows !== 0) {
            return this.constructSelect({
              select: all,
              from: 'drug',
              limit: perPage,
              offset,
            });
          }
        })
        .then(result => {
          if (result) {
            utils.handleResult(result, res, page, pages, perPage, rows);
          } else {
            utils.fail(res, 404, 'Drugs not found');
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Function to get drug by its id
   * @param {number|string} drugId id of drug to retreive
   * @param {express.response} res response
   */
  get(drugId, res) {
    this.dbModule.queryDb('select * from drug where rxcui = ?', [drugId])
        .then(result => {
          if (result[0]) {
            utils.success(res, result[0]);
          } else {
            utils.fail(res, 404, 'Drug not found');
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Function to get prices for particular drug id
   * @param {number|string} drugId id of drug to retreive
   * @param {number|string} pharmacyId id of pharmacy for adjustment
   * @param {express.response} res response
   */
  getPrices(drugId, pharmacyId, res) {
    this.dbModule.queryDb('select rxcui from drug where rxcui = ?', [drugId])
        .then(result => {
          if (result[0]) {
            return this.gsdd.getCurrentPrices(drugId);
          } else {
            utils.success(res, []);
          }
        })
        .then(result => result && this.applyAdjustment(pharmacyId, result))
        .then(result => result && utils.success(res, result))
        .catch(error => utils.error(res, error));
  }

  /**
   * Function to get lowest prices for particular drug id.
   * @param {number|string} drugId id of drug to retreive lowest price
   * @param {express.response} res response
   */
  getLowestPrices(drugId, res) {
    this.dbModule.queryDb('select rxcui from drug where rxcui = ?', [drugId])
        .then(result => {
          if (result[0]) {
            return this.gsdd.getCurrentPrices(drugId);
          } else {
            utils.success(res, []);
          }
        })
        .then(result => result && this.determineLowest(result))
        .then(result => result && utils.success(res, result))
        .catch(error => utils.error(res, error));
  }

  /**
   * Searches for database for maximum rebates and if any, returns price in
   * lowest pharmacy, rebate and pharmacy_id in which this price is lowest.
   * @param {any[]} prices
   * @return {Promise<any[]>}
   */
  async determineLowest(prices) {
    // if no prices passed to function, don't query database for lowest prices.
    if (prices.length == 0) {
      return prices;
    }

    const generalRebates = await this.dbModule.queryDb(
        'select drug_id, drug_id_name, price_type_id, rebate_percent ' +
            'from rebate ' +
            'where pharmacy_id = ? ' +
            'and drug_id_name = ? ' +
            'and drug_id = ?',
        ['any', 'ndc11', 'any']);

    if (generalRebates.length !== 0) {
      let rebate = undefined;

      prices.forEach(p => {
        rebate = generalRebates.find(r => r.price_type_id == p.price_type_id);
        if (rebate) {
          p.price = calculatePrice(p, rebate);
          p.rebate_percent = p.rebate_percent ?
              p.rebate_percent + rebate.rebate_percent :
              rebate.rebate_percent;
        }
      });
    }

    const maxRebate = p => {
      return this.dbModule
          .queryDb(
              'select * from rebate ' +
                  'where drug_id_name = ? and ' +
                  '(drug_id = ? or drug_id = \'any\') and ' +
                  'price_type_id = ? ' +
                  'order by rebate_percent desc limit 1',
              ['ndc11', p.ndc11, p.price_type_id])
          .then(result => {
            // have maximum rebate for price
            if (result[0]) {
              p.price = calculatePrice(p, result[0]);
              p.rebate_percent = p.rebate_percent ?
                  p.rebate_percent + result[0].rebate_percent :
                  result[0].rebate_percent;
              p.lowest_pharmacy_id = result[0].pharmacy_id;
            }
          });
    };

    await Promise.all(prices.map(p => maxRebate(p)));

    return prices;
  }

  /**
   * Applies adjustments by the rules from rebate table. Supporting rules is
   * 'specific rebate for ndc11 and pharmacy_id'(ndc11Pharmacy)
   * 'rebate for all ndc11 for pharmacy_id'(generic)
   * When the generic rules applied, specific rules will not be applied.
   * @param {number|string} pharmacyId id of pharmacy for adjustment
   * @param {any[]} prices
   * @return {Promise<any[]>}
   */
  async applyAdjustment(pharmacyId, prices) {
    // if no prices passed to function, apply no adjustment
    if (prices.length == 0) {
      return prices;
    }

    if (pharmacyId == null) {
      // if pharmacyId not passed to function, left the price as is
      return prices;
    } else {
      // applying general rules
      const generalRebates = await this.dbModule.queryDb(
          'select drug_id, drug_id_name, price_type_id, rebate_percent ' +
              'from rebate ' +
              'where pharmacy_id = ? ' +
              'and drug_id_name = ? ' +
              'and drug_id = ?',
          ['any', 'ndc11', 'any']);

      if (generalRebates.length !== 0) {
        let rebate = undefined;

        prices.forEach(p => {
          rebate = generalRebates.find(r => r.price_type_id == p.price_type_id);
          if (rebate) {
            p.price = calculatePrice(p, rebate);
            p.rebate_percent = p.rebate_percent ?
                p.rebate_percent + rebate.rebate_percent :
                rebate.rebate_percent;
          }
        });
      }

      // flag to match pharmacy rules
      let pharmacyRulesApplied = false;

      // applying pharmacy rules (1 pharmacy - any drug)
      const pharmacyRebates = await this.dbModule.queryDb(
          'select drug_id, drug_id_name, price_type_id, rebate_percent ' +
              'from rebate ' +
              'where pharmacy_id = ? ' +
              'and drug_id_name = ? ' +
              'and drug_id = ?',
          [pharmacyId, 'ndc11', 'any']);

      if (pharmacyRebates.length === 1) {
        const rebate = pharmacyRebates[0];
        prices.forEach(p => {
          if (p.price_type_id === rebate.price_type_id) {
            p.price = calculatePrice(p, rebate);
            p.rebate_percent = p.rebate_percent ?
                p.rebate_percent + rebate.rebate_percent :
                rebate.rebate_percent;
          }
        });
        pharmacyRulesApplied = true;
      }

      if (!pharmacyRulesApplied) {
        // applying pharmacy-drug rules (1 pharmacy - 1 drug)
        // get rebates for pharmacy, price type and ndcs
        const rebates = await this.dbModule.queryDb(
            'select drug_id, drug_id_name, price_type_id, rebate_percent ' +
                'from rebate ' +
                'where pharmacy_id = ? ' +
                'and drug_id_name = ? ' +
                'and drug_id in ?',
            [pharmacyId, 'ndc11', [prices.map(p => p.ndc11)]]);

        if (rebates.length > 0) {
          let rebate = undefined;

          // apply rebate for each price if found, if not - leave as is
          prices.forEach(p => {
            rebate = rebates.find(
                r => r.drug_id == p[r.drug_id_name] &&
                    r.price_type_id == p.price_type_id);
            if (rebate) {
              p.price = calculatePrice(p, rebate);
              p.rebate_percent = p.rebate_percent ?
                  p.rebate_percent + rebate.rebate_percent :
                  rebate.rebate_percent;
            }
          });
        }
      }

      return prices;
    }
  }
}

/**
 * Function to count rebate for price.
 * Counts rebate by unit price, then multiplies by package size.
 * @param {*} price
 * @param {*} rebate
 * @return {number}
 */
function calculatePrice(price, rebate) {
  const rebateCopy = {...rebate};

  if (price.rebate_percent) {
    rebateCopy.rebate_percent += price.rebate_percent;
  }

  const percent = (rebateCopy.rebate_percent / 100) * price.unit_price;
  const p = (price.unit_price - percent) * price.package_size;
  return Number(p.toFixed(4));
}

const all = '*';
const numRows = 'count(rxcui) as numRows';

module.exports = DrugsModel;
