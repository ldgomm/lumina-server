package com.premierdarkcoffee.loyalty.businesses

import com.premierdarkcoffee.loyalty.marketing.WalletDesign
import com.premierdarkcoffee.loyalty.shared.json
import kotlinx.serialization.Serializable
import kotlin.random.Random

@Serializable private data class InitialLook(val category:String,val background:String,val foreground:String,val label:String,val symbol:String,val compositions:List<String>)
private val initialLooks:List<InitialLook> = json.decodeFromString(requireNotNull(BusinessCategories.javaClass.getResource("/com/premierdarkcoffee/loyalty/businesses/initial-wallet-designs.json")).readText())
/** Called only inside the first registration transaction. Existing designs are never randomized. */
fun initialWalletDesign(category:String, name:String, variant:Int=Random.nextInt(3)):WalletDesign {
    require(variant in 0..2)
    val look=initialLooks.firstOrNull { it.category==category } ?: initialLooks.first { it.category=="GENERAL" }
    val light="#"+(1..5 step 2).joinToString("") { i -> kotlin.math.round(look.background.substring(i,i+2).toInt(16)*.12+255*.88).toInt().toString(16).padStart(2,'0') }
    return WalletDesign(displayName=name.take(80),background=when(variant){1->light;2->"#101c2d";else->look.background},
        foreground=when(variant){1->"#102038";2->"#ffffff";else->look.foreground},
        label=when(variant){1->"#33475c";2->"#e4ebf5";else->look.label},stampSymbol=look.symbol,
        composition=look.compositions[variant],artworkStyle=when(variant){1->"SOLID";2->"AURORA";else->"GRADIENT"},
        artworkAccent=when(variant){1->look.background;2->"#80d9dc";else->"#e9b774"}).also { it.validate() }
}
