package moe.memesta.play_on

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

class DeepLinkActivity : AppCompatActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val forward = Intent(this, MainActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      data = intent?.data
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
    }

    startActivity(forward)
    finish()
  }
}
