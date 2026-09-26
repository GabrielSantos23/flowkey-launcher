using FlowKey.Shell.Rendering;
using Xunit;

namespace Shell.Tests;

public class BrandIconSvgParserTests
{
  [Fact]
  public void Preserves_each_colored_path_in_a_brand_svg()
  {
    const string svg = """
      <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <path fill="#4285F4" d="M0 0H16V16H0Z" />
        <polygon fill="#4352B8" points="16,16 32,16 16,32" />
        <path fill="#DBDBDB" d="M16 16H32V32H16Z" />
      </svg>
      """;

    var layers = BrandIconSvgParser.ParseLayers(svg);

    Assert.Collection(
      layers,
      blue => Assert.Equal("#4285F4", blue.Fill),
      purple => Assert.Equal("#4352B8", purple.Fill),
      gray => Assert.Equal("#DBDBDB", gray.Fill));
  }
}
