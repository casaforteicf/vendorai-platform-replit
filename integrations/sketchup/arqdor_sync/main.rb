# frozen_string_literal: true

require "sketchup.rb"
require "json"
require "net/http"
require "uri"
require "tempfile"
require "securerandom"

module Arqdor
  module Sync
    extend self

    DEFAULT_API = "https://app.appvendorai.com/api".freeze

    def collect_manifest(model)
      materials = model.materials.map do |material|
        {
          name: material.display_name,
          color: material.color ? material.color.to_a[0, 3] : nil,
          alpha: material.alpha
        }
      end

      definitions = model.definitions.reject(&:image?).map do |definition|
        instances = definition.instances.map do |instance|
          tr = instance.transformation
          {
            persistent_id: instance.respond_to?(:persistent_id) ? instance.persistent_id : nil,
            name: instance.name,
            layer: instance.layer ? instance.layer.name : nil,
            origin: [tr.origin.x.to_f, tr.origin.y.to_f, tr.origin.z.to_f],
            xaxis: [tr.xaxis.x.to_f, tr.xaxis.y.to_f, tr.xaxis.z.to_f],
            yaxis: [tr.yaxis.x.to_f, tr.yaxis.y.to_f, tr.yaxis.z.to_f],
            zaxis: [tr.zaxis.x.to_f, tr.zaxis.y.to_f, tr.zaxis.z.to_f]
          }
        end
        {
          name: definition.name,
          description: definition.description,
          instances: instances
        }
      end

      {
        schema: "arqdor-sketchup-manifest-v1",
        sketchup_version: Sketchup.version,
        model_title: model.title,
        model_path: model.path,
        generated_at: Time.now.utc.iso8601,
        materials: materials,
        definitions: definitions,
        scenes: model.pages.map { |page| { name: page.name } }
      }
    end

    def settings
      api = Sketchup.read_default("ArqdorSync", "api_url", DEFAULT_API).to_s
      project = Sketchup.read_default("ArqdorSync", "project_id", "").to_s
      token = Sketchup.read_default("ArqdorSync", "token", "").to_s
      prompts = ["API do Arqdor", "ID do pré-projeto", "Token de acesso"]
      defaults = [api, project, token]
      result = UI.inputbox(prompts, defaults, "Enviar para Arqdor")
      return nil unless result
      api_url, project_id, access_token = result.map(&:to_s)
      Sketchup.write_default("ArqdorSync", "api_url", api_url)
      Sketchup.write_default("ArqdorSync", "project_id", project_id)
      Sketchup.write_default("ArqdorSync", "token", access_token)
      { api_url: api_url.sub(%r{/$}, ""), project_id: project_id.strip, token: access_token.strip }
    end

    def export_glb(model)
      temp = File.join(Dir.tmpdir, "arqdor-#{SecureRandom.hex(8)}.glb")
      ok = model.export(temp, {
        triangulated_faces: true,
        edges: false,
        texture_maps: true,
        preserve_instancing: true
      })
      raise "O SketchUp não conseguiu exportar GLB nesta versão." unless ok && File.exist?(temp)
      temp
    end

    def multipart_body(boundary, glb_path, manifest_json, sketchup_version)
      filename = File.basename(glb_path)
      chunks = []
      chunks << "--#{boundary}\r\nContent-Disposition: form-data; name=\"manifest\"\r\n\r\n#{manifest_json}\r\n"
      chunks << "--#{boundary}\r\nContent-Disposition: form-data; name=\"sketchupVersion\"\r\n\r\n#{sketchup_version}\r\n"
      chunks << "--#{boundary}\r\nContent-Disposition: form-data; name=\"model\"; filename=\"#{filename}\"\r\n"
      chunks << "Content-Type: model/gltf-binary\r\n\r\n"
      body = chunks.join.b
      body << File.binread(glb_path)
      body << "\r\n--#{boundary}--\r\n"
      body
    end

    def send_to_arqdor
      model = Sketchup.active_model
      cfg = settings
      return unless cfg
      if cfg[:project_id].empty? || cfg[:token].empty?
        UI.messagebox("Informe o ID do pré-projeto e o token de acesso.")
        return
      end

      glb_path = nil
      begin
        UI.messagebox("O SketchUp vai exportar o modelo em GLB e enviar ao Arqdor.")
        glb_path = export_glb(model)
        manifest = JSON.generate(collect_manifest(model))
        boundary = "----Arqdor#{SecureRandom.hex(12)}"
        uri = URI("#{cfg[:api_url]}/arch/concept-projects/#{URI.encode_www_form_component(cfg[:project_id])}/sketchup-sync")
        request = Net::HTTP::Post.new(uri)
        request["Authorization"] = "Bearer #{cfg[:token]}"
        request["Content-Type"] = "multipart/form-data; boundary=#{boundary}"
        request.body = multipart_body(boundary, glb_path, manifest, Sketchup.version)

        response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", read_timeout: 180) do |http|
          http.request(request)
        end

        if response.code.to_i.between?(200, 299)
          UI.messagebox("Modelo enviado ao Arqdor com sucesso.")
        else
          UI.messagebox("Falha ao enviar ao Arqdor (HTTP #{response.code}).\n#{response.body.to_s[0, 500]}")
        end
      rescue => e
        UI.messagebox("Falha no Arqdor Sync:\n#{e.message}")
      ensure
        File.delete(glb_path) if glb_path && File.exist?(glb_path)
      end
    end

    unless file_loaded?(__FILE__)
      menu = UI.menu("Extensions").add_submenu("Arqdor")
      menu.add_item("Enviar projeto para Arqdor") { send_to_arqdor }
      file_loaded(__FILE__)
    end
  end
end
