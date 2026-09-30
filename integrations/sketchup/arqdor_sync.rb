# frozen_string_literal: true

require "sketchup.rb"
require "extensions.rb"

module Arqdor
  EXTENSION_NAME = "Arqdor Sync".freeze
  EXTENSION_VERSION = "0.1.0".freeze

  unless file_loaded?(__FILE__)
    extension = SketchupExtension.new(EXTENSION_NAME, "arqdor_sync/main")
    extension.description = "Envia o modelo atual do SketchUp para um pré-projeto Arqdor."
    extension.version = EXTENSION_VERSION
    extension.creator = "Arqdor"
    Sketchup.register_extension(extension, true)
    file_loaded(__FILE__)
  end
end
