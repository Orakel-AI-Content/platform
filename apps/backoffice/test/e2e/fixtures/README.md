# Fixtures do E2E

- `foto-gps.jpg` – JPEG de 4.000×3.000 px com GPS no EXIF (São Paulo: 23°33′S, 46°38′W),
  usado por `midia.spec.ts` (#53) para conferir que a ingestão limita o original a 2.560 px
  e remove a localização. Gerado com o `sharp` do backoffice, a partir de um SVG simples:

  ```js
  sharp(svg)
    .jpeg({ quality: 80 })
    .withExif({
      IFD0: { Make: 'Orakel', Model: 'E2E' },
      IFD3: {
        GPSLatitudeRef: 'S',
        GPSLatitude: '23/1 33/1 1/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '46/1 38/1 1/1',
      },
    })
    .toFile('foto-gps.jpg');
  ```
