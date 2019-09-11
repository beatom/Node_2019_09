// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

const databaseModule = require('../../lib/database-module');
const utils = require('../../lib/utils');

class PharmaciesModel {
  /**
   * @param {databaseModule} [dbModule]
   */
  constructor(dbModule) {
    this.dbModule = dbModule || databaseModule;

    this.constructSelect = utils.constructSelect.bind(this);
  }

  /**
   * Function for searching drugs in database
   * @param {string} searchQuery query to search in database
   * @param {number} page number of page if result is long
   * @param {number} perPage number of items per page
   * @param {express.response} res response
   */
  searchPharmacies(searchQuery, page, perPage, res) {
    let rows = 0;
    let pages = 0;

    const offset = (page - 1) * perPage;

    const where = {store_name: `%${searchQuery}%`};

    this.constructSelect({select: numRows, from: 'pharmacy', where})
        .then(result => {
          rows = result[0].numRows;
          pages = Math.ceil(rows / perPage);

          if (rows !== 0) {
            return this.constructSelect({
              select: all,
              from: 'pharmacy',
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
            utils.fail(res, 404, 'Pharmacy not found');
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Function to get all pharmacies from database.
   * Because list can be very big, result is paged.
   * @param {number} page page number
   * @param {number} perPage amount of results per page
   * @param {express.response} res response object
   */
  getAll(page, perPage, res) {
    let rows = 0;
    let pages = 0;

    const offset = (page - 1) * perPage;

    this.constructSelect({select: numRows, from: 'pharmacy'})
        .then(result => {
          rows = result[0].numRows;
          pages = Math.ceil(rows / perPage);

          if (rows !== 0) {
            return this.constructSelect({
              select: all,
              from: 'pharmacy',
              limit: perPage,
              offset,
            });
          }
        })
        .then(result => {
          if (result) {
            utils.handleResult(result, res, page, pages, perPage, rows);
          } else {
            utils.fail(res, 404, 'Pharmacies not found');
          }
        })
        .catch(error => utils.error(res, error));
  }

  /**
   * Function to get only one pharmacy by its id.
   * @param {number} pharmacyId id of pharmacy
   * @param {express.response} res response object
   */
  get(pharmacyId, res) {
    this.dbModule
        .queryDb('select * from pharmacy where ncpdpid = ?', [pharmacyId])
        .then(result => {
          if (result[0]) {
            utils.success(res, result[0]);
          } else {
            utils.fail(res, 404, 'Pharmacy not found');
          }
        })
        .catch(error => utils.error(res, error));
  }
}

const all = '*';
const numRows = 'count(ncpdpid) as numRows';

module.exports = PharmaciesModel;
