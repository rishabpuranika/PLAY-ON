package moe.memesta.play_on

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    
    // Request MANAGE_EXTERNAL_STORAGE permission for Android 11+ (API 30+)
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
        if (!android.os.Environment.isExternalStorageManager()) {
            val intent = android.content.Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
            val uri = android.net.Uri.fromParts("package", packageName, null)
            intent.data = uri
            startActivity(intent)
        }
    }
  }
}
