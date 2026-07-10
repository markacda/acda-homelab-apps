import express from 'express'
import type { Express } from 'express'
import { HomewizardCsvParser } from '../../Adapters/Homewizard/homewizard-csv-parser.ts'
import { EnergyZeroPriceProvider } from '../../Adapters/EnergyZero/energyzero-price-provider.ts'
import { ComparisonService } from '../Services/comparison-service.ts'
import { CalculationController } from '../Controllers/calculation-controller.ts'
import { errorMapping } from '../Filters/error-mapping.ts'

/**
 * Composition root: build the adapters, inject them into the comparison service,
 * wire the controller, and mount everything on the Express app. Call after
 * createApp() and before startServer().
 */
export function register(app: Express): void {
  // Adapters (external ports).
  const usageParser = new HomewizardCsvParser()
  const priceProvider = new EnergyZeroPriceProvider()

  // Application service + controller.
  const comparisonService = new ComparisonService(usageParser, priceProvider)
  const calculationController = new CalculationController(comparisonService)

  app.use(express.json({ limit: '1mb' }))
  app.use('/api', calculationController.router)
  // Map domain errors to HTTP; unknown errors fall through to server-kit's handler.
  app.use(errorMapping())
}
