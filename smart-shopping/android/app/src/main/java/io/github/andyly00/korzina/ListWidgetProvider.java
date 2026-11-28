package io.github.andyly00.korzina;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Home-screen widget with the first list of the app. The web app sends what to show through
 * MainActivity's AppWindow.setWidget (src/device.ts, updateWidget); it is kept in
 * SharedPreferences so the widget can be drawn while the app is closed.
 *
 * The widget's "+" opens QuickAddActivity. What is typed there waits in a queue ("pending")
 * until the app takes it (AppWindow.takeWidgetAdditions) and adds it to the list; meanwhile the
 * widget already shows it.
 */
public class ListWidgetProvider extends AppWidgetProvider {

    private static final String PREFERENCES = "korzina_widget";
    private static final String KEY = "data";
    private static final String PENDING = "pending";
    private static final int MAX_PENDING = 50;

    static void save(Context context, String json) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().putString(KEY, json).apply();
        refresh(context);
    }

    /** Queues products typed in QuickAddActivity for the list `listId` ("" when there is none). */
    static synchronized void addPending(Context context, String listId, String text) {
        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        JSONArray pending = pending(preferences);
        if (pending.length() < MAX_PENDING) {
            try {
                pending.put(new JSONObject().put("listId", listId).put("text", text).put("at", System.currentTimeMillis()));
            } catch (JSONException ignored) {
                return;
            }
            preferences.edit().putString(PENDING, pending.toString()).apply();
        }
        refresh(context);
    }

    /** Hands the queue to the app and empties it, as one step. */
    static synchronized String takePending(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        String taken = pending(preferences).toString();
        preferences.edit().remove(PENDING).commit();
        // The "+" lines go: what the app added comes back with its next setWidget, and an
        // entry it could not use must not stay on the widget.
        refresh(context);
        return taken;
    }

    private static JSONArray pending(SharedPreferences preferences) {
        try {
            return new JSONArray(preferences.getString(PENDING, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, ListWidgetProvider.class));
        for (int id : ids) {
            manager.updateAppWidget(id, views(context));
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, views(context));
        }
    }

    private static RemoteViews views(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        String title = context.getString(R.string.app_name);
        String subtitle = context.getString(R.string.widget_empty);
        String listId = "";
        String listName = "";
        StringBuilder items = new StringBuilder();
        try {
            JSONObject data = new JSONObject(preferences.getString(KEY, "{}"));
            title = data.optString("title", title);
            subtitle = data.optString("subtitle", subtitle);
            listId = data.optString("listId", "");
            listName = listId.isEmpty() ? "" : title;
            // Products added from the widget come first, until the app takes them in.
            JSONArray pending = pending(preferences);
            for (int index = 0; index < pending.length(); index++) {
                for (String line : pending.getJSONObject(index).optString("text").split("\\s*(?:\\n|;|,\\s)\\s*")) {
                    // As the app reads it: a line without a letter or digit is not a product.
                    if (!line.matches(".*[\\p{L}\\p{N}].*")) continue;
                    if (items.length() > 0) items.append('\n');
                    items.append("+  ").append(line);
                }
            }
            JSONArray list = data.optJSONArray("items");
            for (int index = 0; list != null && index < list.length(); index++) {
                if (items.length() > 0) items.append('\n');
                items.append("•  ").append(list.getString(index));
            }
        } catch (JSONException ignored) {
            // Shows the empty widget until the app sends valid data again.
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_list);
        views.setTextViewText(R.id.widget_title, title);
        views.setTextViewText(R.id.widget_subtitle, subtitle);
        views.setTextViewText(R.id.widget_items, items.toString());

        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);

        Intent add = new Intent(context, QuickAddActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK)
                .putExtra(QuickAddActivity.EXTRA_LIST_ID, listId)
                .putExtra(QuickAddActivity.EXTRA_LIST_NAME, listName);
        PendingIntent adding = PendingIntent.getActivity(context, 1, add, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_add, adding);
        return views;
    }
}
