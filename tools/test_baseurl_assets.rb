# frozen_string_literal: true

require 'minitest/autorun'
require 'jekyll'
require 'tmpdir'

ROOT = File.expand_path('..', __dir__)
TEMPLATE = Liquid::Template.parse(
  File.read(File.join(ROOT, '_includes', 'baseurl-content.html')),
)

class BaseurlAssetsTest < Minitest::Test
  def render(content, baseurl)
    site = Jekyll::Site.new(
      Jekyll.configuration(
        'source' => ROOT,
        'destination' => File.join(Dir.tmpdir, 'pool-baseurl-assets-test'),
        'baseurl' => baseurl,
      ),
    )

    TEMPLATE.render!(
      { 'include' => { 'content' => content } },
      registers: { site: site },
      strict_filters: true,
    )
  end

  def test_adds_baseurl_to_root_asset_attributes
    html = <<~HTML
      <img src="/assets/uploads/test.bmp">
      <a href="/assets/downloads/plan.pdf">Plan</a>
    HTML

    output = render(html, '/Pool')

    assert_includes output, '<img src="/Pool/assets/uploads/test.bmp">'
    assert_includes output, '<a href="/Pool/assets/downloads/plan.pdf">Plan</a>'
  end

  def test_leaves_other_and_already_prefixed_urls_unchanged
    html = <<~HTML
      <img src="/Pool/assets/uploads/old.png">
      <img src="https://example.com/assets/external.png">
      <a href="/news/">News</a>
    HTML

    output = render(html, '/Pool')

    assert_includes output, '<img src="/Pool/assets/uploads/old.png">'
    assert_includes output, '<img src="https://example.com/assets/external.png">'
    assert_includes output, '<a href="/news/">News</a>'
  end

  def test_leaves_root_asset_urls_unchanged_without_baseurl
    html = '<img src="/assets/uploads/test.bmp">'

    assert_includes render(html, ''), html
  end
end
