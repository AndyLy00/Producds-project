package io.github.andyly00.korzina;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

/**
 * The small window the widget's "+" opens over the home screen: products typed here are queued
 * (ListWidgetProvider.addPending) and shown on the widget at once; the app adds them to the list
 * the next time it opens (src/app/useShoppingApp.ts). Several products may be separated by
 * commas or new lines, each as the app's quick-add bar takes it ("milk 2 l").
 */
public class QuickAddActivity extends Activity {

    static final String EXTRA_LIST_ID = "listId";
    static final String EXTRA_LIST_NAME = "listName";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.quick_add);
        getWindow().setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);

        String listId = getIntent().getStringExtra(EXTRA_LIST_ID);
        String listName = getIntent().getStringExtra(EXTRA_LIST_NAME);
        TextView title = findViewById(R.id.quick_add_title);
        title.setText(listName == null || listName.isEmpty()
                ? getString(R.string.quick_add_title_new)
                : getString(R.string.quick_add_title, listName));

        EditText field = findViewById(R.id.quick_add_field);
        Button add = findViewById(R.id.quick_add_button);
        Button cancel = findViewById(R.id.quick_add_cancel);
        Runnable submit = () -> {
            String text = field.getText().toString().trim();
            if (text.isEmpty()) return;
            ListWidgetProvider.addPending(getApplicationContext(), listId == null ? "" : listId, text);
            finish();
        };
        add.setOnClickListener(view -> submit.run());
        cancel.setOnClickListener(view -> finish());
        field.setOnEditorActionListener((view, action, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN;
            if (action == EditorInfo.IME_ACTION_DONE || enter) {
                submit.run();
                return true;
            }
            return false;
        });
        field.requestFocus();
    }
}
