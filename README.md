# EQ-SANS in 3D

An interactive three.js model of the **EQ-SANS** small-angle neutron scattering instrument (Beamline 6, Spallation Neutron Source, Oak Ridge National Laboratory).

**Live page:** https://cw-do.github.io/eqsans-model/

## What it shows

- **SNS site**: the page opens on a schematic aerial model of the Spallation Neutron Source (linac, accumulator ring, target building, the curved office building and CNMS). *Take me to EQ-SANS* flies in through the roof of the target building to beamline 6. Add `#eqsans` to the URL to open the instrument directly.
- **The beamline**, from the moderator to the concrete plug behind the detector tank: curved bender, three bandwidth choppers, slit wheels, guard slits, sample aperture, banjo-cell sample, sapphire window, and the 1 m × 1 m detector inside the vacuum tank.
- **Explode**: takes the instrument apart.
- **Neutron beam**: time-of-flight pulses as glowing beads coloured by wavelength. The choppers and apertures absorb what they should, the sample scatters with a sphere form factor, and the detector builds up a 2D pattern and I(Q).
- **Ride the pulse**: the camera follows the centre-wavelength neutrons through the choppers, collimation and sample.
- **Time–distance**: a time-of-flight diagram drawn from the same clock and chopper phases as the 3D beam.
- **Band selection**: choose the minimum wavelength; the band width and chopper phases are set so the band just fills one 1/60 s frame at the detector.
- **X-ray view / Hide**: fade or hide the shielding, enclosure, mezzanine and tank to see inside.

## Accuracy

Component positions along the beam follow Figure 1 of Zhao, Gao & Liu, *J. Appl. Cryst.* **43** (2010) 1068–1077. Other dimensions (beam height, tank diameter, enclosure, mezzanine) are estimated from photographs. The site model is built by eye from aerial photographs: building footprints, distances and the angle of beamline 6 are approximate, and the proton path is drawn above ground so it can be followed. Time is slowed 180×, the scattered fraction is exaggerated so the beads are visible, and the assignment of band edges to individual choppers is a simplification. This is a teaching model, not an engineering drawing.

## Run locally

It is a static site with no build step. Serve the folder with any web server:

```
python3 -m http.server 8080
```

three.js r170 is vendored in `vendor/three` (MIT licence, see `vendor/three/LICENSE`).
