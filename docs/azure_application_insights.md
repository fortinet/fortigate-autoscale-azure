# Azure Application Insights

FortiGate Autoscale requires Azure Application Insights to capture the Autoscale handler functions (Function App) invocation logs.
If the FortiGate Autoscale is deployed to a region that is supported by the Azure Application Insights, the deployment template will automatically configure the Application Insights. Otherwise, it will not do so by default. However, if not configured by the deployment, users can still manually configure the Application Insights for the Autoscale handler functions in a different region.

As the Azure Application Insights supported regions may change from time to time, please read [Azure Monitor overview](https://docs.microsoft.com/en-us/azure/azure-monitor/overview) for more details.

_FortiGate Autoscale for Azure_ project maintains a list of the supported regions in the template: [link_template.function_app.json](../templates/link_template.function_app.json). It is stored as a variable: _functionAppInsightAvailableLocations_.

If you found that the list is out-dated, please let us know by creating an issue.
