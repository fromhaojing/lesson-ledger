import AppKit
import SwiftUI

/// The original app's theme keys and light/dark palettes.
enum ThemeColor: String, CaseIterable, Identifiable {
    case mint, blue, purple, orange, rose, red

    static let defaultColor: ThemeColor = .red
    var id: String { rawValue }
    var title: String {
        switch self {
        case .mint: return "薄荷绿"
        case .blue: return "湖蓝"
        case .purple: return "紫罗兰"
        case .orange: return "暖橙"
        case .rose: return "玫瑰"
        case .red: return "珊瑚红"
        }
    }

    static func resolve(_ value: String?) -> ThemeColor {
        // Keep the selection made in the first macOS version when restoring the original key.
        if value == "pink" { return .rose }
        return value.flatMap(ThemeColor.init(rawValue:)) ?? defaultColor
    }

    private var light: Palette {
        switch self {
        case .mint: return Palette(primary: 0x14A38B, primaryDark: 0x087766, surfaceSoft: 0xEEF6F4)
        case .blue: return Palette(primary: 0x2563EB, primaryDark: 0x1D4ED8, surfaceSoft: 0xEEF4FF)
        case .purple: return Palette(primary: 0x7C3AED, primaryDark: 0x5B21B6, surfaceSoft: 0xF3EEFF)
        case .orange: return Palette(primary: 0xEA7A1A, primaryDark: 0xB45309, surfaceSoft: 0xFFF3E6)
        case .rose: return Palette(primary: 0xE11D48, primaryDark: 0xBE123C, surfaceSoft: 0xFFF1F3)
        case .red: return Palette(primary: 0xFF3B30, primaryDark: 0xD70015, surfaceSoft: 0xFFF1F0)
        }
    }
    private var dark: Palette {
        switch self {
        case .mint: return Palette(primary: 0x4AD6BF, primaryDark: 0x82E8D8, surfaceSoft: 0x15251F)
        case .blue: return Palette(primary: 0x60A5FA, primaryDark: 0x93C5FD, surfaceSoft: 0x172236)
        case .purple: return Palette(primary: 0xA78BFA, primaryDark: 0xC4B5FD, surfaceSoft: 0x241B33)
        case .orange: return Palette(primary: 0xFDBA74, primaryDark: 0xFED7AA, surfaceSoft: 0x2D2118)
        case .rose: return Palette(primary: 0xFB7185, primaryDark: 0xFDA4AF, surfaceSoft: 0x301B23)
        case .red: return Palette(primary: 0xFF453A, primaryDark: 0xFF6961, surfaceSoft: 0x321B1A)
        }
    }

    var primary: Color { Color(nsColor: nativePrimary) }
    var primaryDark: Color { Color(nsColor: nativeColor(\.primaryDark)) }
    var surfaceSoft: Color { Color(nsColor: nativeColor(\.surfaceSoft)) }
    var nativePrimary: NSColor { nativeColor(\.primary) }

    private struct Palette { let primary: UInt32; let primaryDark: UInt32; let surfaceSoft: UInt32 }
    private func nativeColor(_ key: KeyPath<Palette, UInt32>) -> NSColor {
        NSColor(name: nil) { appearance in
            let palette = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? dark : light
            let hex = palette[keyPath: key]
            return NSColor(srgbRed: Double((hex >> 16) & 0xFF) / 255,
                           green: Double((hex >> 8) & 0xFF) / 255,
                           blue: Double(hex & 0xFF) / 255, alpha: 1)
        }
    }
}
