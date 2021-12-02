import { pool } from './pool';
import { parseParameters } from './parser';
import { slowQueryWarning, debug, resourceName } from './config';
import { FormatError } from './errors';

const execute = async (query, parameters, resource) => {
  try {
    [query, parameters] = parseParameters(query, parameters);
    const connection = await pool.getConnection();
    ScheduleResourceTick(resourceName);

    const startTime = process.hrtime();
    const [rows] = await connection.query(query, parameters);
    const executionTime = process.hrtime(startTime)[1] / 1000000; // nanosecond to millisecond

    if (executionTime >= slowQueryWarning || debug)
      console.log(
        `^3[${debug ? 'DEBUG' : 'WARNING'}] ${resource} took ${executionTime}ms to execute a query!
        ${query} ${JSON.stringify(parameters)}^0`
      );

    connection.release();
    return rows;
  } catch (error) {
    console.log(
      `^1[ERROR] ${resource} was unable to execute a query!
        ${error.message}
        ${error.sql || `${query} ${JSON.stringify(parameters)}`}^0`
    );
    debug && console.trace(error);
  }
};

const queryType = (query) => {
  switch (query.replace(/\s.*/, '')) {
    case 'SELECT':
      return 1;
    case 'INSERT':
      return 2;
    case 'UPDATE':
      return 3;
    case 'DELETE':
      return 3;
    default:
      return false;
  }
};

const preparedStatement = async (query, parameters, resource) => {
  try {
    if (!Array.isArray(parameters))
      throw new FormatError(`Placeholders were defined, but query received no parameters!`, query);

    if (typeof query !== 'string') throw new FormatError(`Prepared statements must utilise a single query`);

    const type = queryType(query);
    if (!type) throw new FormatError(`Prepared statements only accept SELECT, INSERT, UPDATE, and DELETE methods!`);

    const connection = await pool.getConnection();
    ScheduleResourceTick(resourceName);

    const results = [];
    let queryCount = parameters.length;
    const startTime = process.hrtime();

    for (let i = 0; i < queryCount; i++) {
      const [rows] = await connection.execute(query, parameters[i]);
      results[i] = rows && (type === 3 ? rows.affectedRows : type === 2 ? rows.insertId : rows);
    }

    const executionTime = process.hrtime(startTime)[1] / 1000000; // nanosecond to millisecond
    if (executionTime >= slowQueryWarning || debug)
      console.log(
        `^3[${debug ? 'DEBUG' : 'WARNING'}] ${resource} took ${executionTime}ms to execute ${
          queryCount > 1 ? queryCount + ' queries' : 'a query'
        }!
        ${query} ${JSON.stringify(parameters)}^0`
      );

    connection.release();

    if (results.length === 1) {
      if (type === 1) {
        if (results[0][0] && Object.keys(results[0][0]).length === 1) {
          return Object.values(results[0][0])[0];
        }
        return results[0][0];
      }
      return results[0];
    }
    return results;
  } catch (error) {
    console.log(
      `^1[ERROR] ${resource} was unable to execute a query!
        ${error.message}
        ${error.sql || `${query} ${JSON.stringify(parameters)}`}^0`
    );
    debug && console.trace(error);
  }
};

export { execute, preparedStatement };
