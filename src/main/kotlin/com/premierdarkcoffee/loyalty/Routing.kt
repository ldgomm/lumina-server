package com.premierdarkcoffee.loyalty

import com.premierdarkcoffee.loyalty.application.configureRouting as installRoutes
import io.ktor.server.application.Application

/** Compatibility entry point for application.yaml and installed deployments. */
fun Application.configureRouting() = installRoutes()
