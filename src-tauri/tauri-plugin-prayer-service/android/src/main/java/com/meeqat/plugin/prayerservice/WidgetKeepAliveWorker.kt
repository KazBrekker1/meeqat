package com.meeqat.plugin.prayerservice

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.util.Log
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.Worker
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * WorkManager safety net that ensures CountdownService stays running.
 * Runs every 15 minutes (WorkManager minimum) and restarts the service
 * if it was killed by the system or OEM battery optimizations.
 */
class WidgetKeepAliveWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {

    companion object {
        private const val TAG = "WidgetKeepAliveWorker"
        private const val UNIQUE_WORK_NAME = "widget_keepalive"

        fun enqueue(context: Context) {
            val request = PeriodicWorkRequestBuilder<WidgetKeepAliveWorker>(15, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(UNIQUE_WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
            Log.d(TAG, "Enqueued keep-alive worker")
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_WORK_NAME)
            Log.d(TAG, "Cancelled keep-alive worker")
        }
    }

    override fun doWork(): Result {
        val widgetIds = AppWidgetManager.getInstance(applicationContext)
            .getAppWidgetIds(ComponentName(applicationContext, PrayerWidgetProvider::class.java))

        if (widgetIds.isEmpty()) {
            Log.d(TAG, "No active widgets, skipping")
            return Result.success()
        }

        Log.d(TAG, "Keep-alive: ensuring CountdownService is running for ${widgetIds.size} widgets")

        try {
            WidgetUpdateReceiver.ensureUpdatesActive(applicationContext)
        } catch (e: Exception) {
            Log.e(TAG, "Error in keep-alive: ${e.message}", e)
        }

        return Result.success()
    }
}
