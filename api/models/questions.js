'use strict';

const lib = '../../lib';
const databaseModule = require(`${lib}/database-module`);
const resUtils = require(`${lib}/utils`);
const queryDb = databaseModule.queryDb;

class QuestionModel {
  constructor() {}

  getAll(token, res) {
    const selectSql = 'select name, email, question from questions';
    queryDb(selectSql)
        .then(result => resUtils.success(res, result || []))
        .catch(error => resUtils.error(res, error));
  }
}

module.exports = QuestionModel;
