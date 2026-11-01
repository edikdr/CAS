import QtQuick
import "../theme"

Text {
    property bool mono: true
    property bool caps: false
    color: Theme.ink
    font.family: mono ? Theme.fontMono : Theme.fontUi
    font.pixelSize: 12
    font.letterSpacing: caps ? 1.4 : 0
    font.capitalization: caps ? Font.AllUppercase : Font.MixedCase
    elide: Text.ElideRight
}
