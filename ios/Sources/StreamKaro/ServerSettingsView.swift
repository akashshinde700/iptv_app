import SwiftUI

/// Point the app at your own StreamKaro deployment — no rebuild needed.
///
/// Reachable from the offline screen, or from inside the website through
/// `window.StreamKaroNative.openSettings()`.
struct ServerSettingsView: View {
    @ObservedObject var store: WebStore
    @Environment(\.dismiss) private var dismiss

    @State private var draft: String = ""
    @State private var errorText: String?
    @State private var savedToast = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://your-site.example.com", text: $draft)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .onChange(of: draft) { _, _ in errorText = nil }

                    if let errorText {
                        Label(errorText, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                } header: {
                    Text("StreamKaro server")
                } footer: {
                    Text("The app loads this website and turns it into a native app. Use the address you deployed StreamKaro to — the one you open in a browser.")
                }

                Section {
                    Button {
                        save()
                    } label: {
                        Label(savedToast ? "Saved" : "Save & reload", systemImage: savedToast ? "checkmark.circle.fill" : "arrow.clockwise")
                    }
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines) == store.baseURL.absoluteString)

                    Button("Use the default server") {
                        store.resetBaseURL()
                        draft = store.baseURL.absoluteString
                        savedToast = true
                        dismissAfterSaving()
                    }
                    .disabled(!AppConfig.hasOverride && draft == store.baseURL.absoluteString)
                } footer: {
                    Text("Handy when your domain changes: fix the app on a phone that is already installed, instead of shipping a new build.")
                }

                Section("About") {
                    LabeledContent("App version", value: AppConfig.versionDescription)
                    LabeledContent("Loading", value: store.baseURL.absoluteString)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    LabeledContent("Picture-in-Picture", value: "Yes — tap the PiP button in the player")
                    LabeledContent("AirPlay", value: "Yes — from the player's AirPlay button")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .onAppear { draft = store.baseURL.absoluteString }
        }
        .preferredColorScheme(.dark)
    }

    private func save() {
        if store.updateBaseURL(draft) {
            savedToast = true
            dismissAfterSaving()
        } else {
            errorText = "That doesn't look like a web address. Try something like https://tv.example.com"
        }
    }

    private func dismissAfterSaving() {
        Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            dismiss()
        }
    }
}
