import { fazAuthScheduler } from './func';

// NOTE: this exports style is for Azure Function compatibility
// see: https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=v2#exporting-an-async-function
module.exports = fazAuthScheduler;
