package com.meeqat.plugin.prayerservice

import android.content.Context
import android.util.Log
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.Worker
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * WorkManager safety net behind the alarms in [WidgetUpdateReceiver].
 * Runs every 15 minutes (WorkManager minimum), redraws the widgets and re-arms
 * the alarms in case the system or an OEM battery optimization dropped them.
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
        try {
            // Both are no-ops without a widget; ensureUpdatesActive then also cancels this worker.
            PrayerWidgetProvider.updateAllWidgets(applicationContext)
            WidgetUpdateReceiver.ensureUpdatesActive(applicationContext)
        } catch (e: Exception) {
            Log.e(TAG, "Error in keep-alive: ${e.message}", e)
        }

        return Result.success()
    }
}
